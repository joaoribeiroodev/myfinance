// Barramento de eventos simples em memória, usado para avisar outras
// telas (ex: Dashboard) que algo mudou (ex: lançamento criado pelo FAB
// global) e elas devem recarregar seus dados.
type Listener = () => void;

const listeners = new Set<Listener>();

export function onDataChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitDataChanged() {
  listeners.forEach((fn) => fn());
}
