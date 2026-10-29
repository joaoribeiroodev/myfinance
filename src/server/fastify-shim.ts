// Shim mínimo que imita a fatia da API do Fastify usada pelas rotas
// herdadas de packages/api (app.get/post/put/delete, addHook("preHandler"),
// register, decorate) — criado pra reaproveitar as rotas originais quase
// sem alteração dentro de uma rota catch-all do Next.js (app/api/[[...slug]]),
// em vez de reescrever cada handler à mão. Não é um Fastify de verdade: só
// o suficiente pra rodar essas rotas específicas num ambiente serverless.
//
// Peça central que falta no Fastify real e que replicamos aqui: o roteador
// por árvore radix do Fastify sempre prioriza um segmento literal
// ("/transactions/stale-subscriptions") sobre um parâmetro
// ("/transactions/:id"), não importa a ordem de registro. Por isso o
// matching abaixo pontua cada rota candidata pela quantidade de segmentos
// literais batendo, e escolhe a mais específica — sem isso,
// "stale-subscriptions" cairia no handler de ":id" por ter sido registrado
// depois dele no arquivo original.

export type ShimRequest = {
  method: string;
  query: Record<string, any>;
  params: Record<string, any>;
  body: any;
  headers: Record<string, string>;
  user?: any;
};

export class ShimReply {
  statusCode = 200;
  _headers: Record<string, string> = {};
  _sent = false;
  _payload: any = undefined;

  code(n: number) {
    this.statusCode = n;
    return this;
  }
  header(key: string, value: string) {
    this._headers[key] = value;
    return this;
  }
  send(payload?: any) {
    this._sent = true;
    this._payload = payload;
    return this;
  }
}

type Handler = (req: ShimRequest, reply: ShimReply) => any;

interface RouteDef {
  method: string;
  segments: string[];
  handler: Handler;
  preHandlers: Handler[];
}

function splitPath(path: string): string[] {
  return path.split("/").filter(Boolean);
}

// Proxy-friendly: decorators (jwt, authenticate) ficam num objeto
// compartilhado por referência entre o app raiz e todos os filhos criados
// via register(), pra "app.authenticate" funcionar em qualquer escopo —
// igual ao app.decorate(...) global do Fastify.
export class ShimApp {
  // index signature pra "app.authenticate" e "app.jwt.sign(...)" (decorados
  // em runtime via decorate(), ver Proxy abaixo) passarem no type-check —
  // o Fastify real resolve isso com "declare module" de cada plugin; aqui
  // é mais simples só abrir o tipo.
  [key: string]: any;
  private routes: RouteDef[];
  private decorators: Record<string, any>;
  private localPreHandlers: Handler[];

  constructor(routes: RouteDef[], decorators: Record<string, any>, inherited: Handler[] = []) {
    this.routes = routes;
    this.decorators = decorators;
    this.localPreHandlers = [...inherited];
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (prop in target || typeof prop === "symbol") {
          return Reflect.get(target, prop, receiver);
        }
        return target.decorators[prop as string];
      },
    });
  }

  addHook(name: string, fn: Handler) {
    if (name === "preHandler") this.localPreHandlers.push(fn);
  }

  private add(method: string, path: string, a: any, b?: Handler) {
    let preHandler: Handler[] = [];
    let handler: Handler;
    if (typeof a === "function") {
      handler = a;
    } else {
      preHandler = a?.preHandler ?? [];
      handler = b!;
    }
    this.routes.push({
      method,
      segments: splitPath(path),
      handler,
      preHandlers: [...this.localPreHandlers, ...preHandler],
    });
  }

  // Overloads (em vez de só "a: any") pra que o TypeScript consiga tipar
  // corretamente os parâmetros (req, reply) do handler nas duas formas de
  // chamada usadas nas rotas originais: "app.get(path, handler)" e
  // "app.get(path, { preHandler: [...] }, handler)". Com um único
  // parâmetro "a: any" no meio, o handler literal perderia a tipagem
  // contextual e cairia em implicit-any (quebra com strict: true).
  get(path: string, handler: Handler): void;
  get(path: string, opts: { preHandler?: Handler[] }, handler: Handler): void;
  get(path: string, a: any, b?: Handler) {
    this.add("GET", path, a, b);
  }
  post(path: string, handler: Handler): void;
  post(path: string, opts: { preHandler?: Handler[] }, handler: Handler): void;
  post(path: string, a: any, b?: Handler) {
    this.add("POST", path, a, b);
  }
  put(path: string, handler: Handler): void;
  put(path: string, opts: { preHandler?: Handler[] }, handler: Handler): void;
  put(path: string, a: any, b?: Handler) {
    this.add("PUT", path, a, b);
  }
  delete(path: string, handler: Handler): void;
  delete(path: string, opts: { preHandler?: Handler[] }, handler: Handler): void;
  delete(path: string, a: any, b?: Handler) {
    this.add("DELETE", path, a, b);
  }

  async register(pluginFn: (app: ShimApp) => any) {
    const child = new ShimApp(this.routes, this.decorators, this.localPreHandlers);
    return pluginFn(child);
  }

  decorate(name: string, value: any) {
    this.decorators[name] = value;
  }
}

export function createRootApp() {
  const routes: RouteDef[] = [];
  const decorators: Record<string, any> = {};
  const app = new ShimApp(routes, decorators);
  return { app, routes };
}

// Acha a rota mais específica (mais segmentos literais batendo) pro
// método+caminho informado — ver comentário no topo do arquivo.
export function matchRoute(routes: RouteDef[], method: string, pathname: string) {
  const reqSegments = splitPath(pathname);
  let best: { route: RouteDef; params: Record<string, string>; score: number } | null = null;

  for (const route of routes) {
    if (route.method !== method) continue;
    if (route.segments.length !== reqSegments.length) continue;

    let score = 0;
    let ok = true;
    const params: Record<string, string> = {};

    for (let i = 0; i < route.segments.length; i++) {
      const seg = route.segments[i];
      const reqSeg = reqSegments[i];
      if (seg.startsWith(":")) {
        params[seg.slice(1)] = decodeURIComponent(reqSeg);
      } else if (seg === reqSeg) {
        score++;
      } else {
        ok = false;
        break;
      }
    }

    if (ok && (!best || score > best.score)) {
      best = { route, params, score };
    }
  }

  return best;
}
