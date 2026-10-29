// Agora a API mora dentro do mesmo app Next.js (src/app/api/...) — por
// padrão chama caminho relativo, mesma origem, sem precisar de URL externa.
// NEXT_PUBLIC_API_URL continua existindo só como escape hatch (ex: apontar
// pra um ambiente de preview diferente), normalmente fica vazio.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";
const TOKEN_KEY = "myfinance_token";

// Por padrão o token fica em sessionStorage: some quando a aba/navegador é
// fechado, então o app sempre pede login de novo ao reabrir. Só vai pra
// localStorage (persistindo entre sessões) se o usuário marcar "manter
// sessão ativa" no login.
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string, remember = false) {
  if (remember) {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.removeItem(TOKEN_KEY);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

export async function api<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 401 && typeof window !== "undefined") {
    clearToken();
    window.location.href = "/login";
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Erro ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export { API_URL };
