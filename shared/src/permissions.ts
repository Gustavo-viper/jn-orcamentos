export const MODULES = [
  'dashboard',
  'clients',
  'services',
  'products',
  'quotes',
  'jobs',
  'finance',
  'reports',
  'settings',
] as const;
export type Module = (typeof MODULES)[number];

export const ACTIONS = ['view', 'create', 'edit', 'delete'] as const;
export type Action = (typeof ACTIONS)[number];

export const MODULE_LABEL: Record<Module, string> = {
  dashboard: 'Painel',
  clients: 'Clientes',
  services: 'Serviços',
  products: 'Produtos e estoque',
  quotes: 'Orçamentos',
  jobs: 'Obras / OS',
  finance: 'Financeiro',
  reports: 'Relatórios',
  settings: 'Configurações',
};
export const ACTION_LABEL: Record<Action, string> = {
  view: 'Visualizar',
  create: 'Cadastrar',
  edit: 'Alterar',
  delete: 'Excluir',
};

export type PermissionMap = Partial<Record<Module, Partial<Record<Action, boolean>>>>;

export interface PermissionSubject {
  role: 'admin' | 'employee';
  permissions: PermissionMap;
  active?: boolean;
}

export function can(user: PermissionSubject | null | undefined, module: Module, action: Action = 'view'): boolean {
  if (!user || user.active === false) return false;
  if (user.role === 'admin') return true;
  const m = user.permissions?.[module];
  if (!m) return false;
  if (action !== 'view' && !m.view) return false;
  return !!m[action];
}

/** Permissões iniciais sugeridas para um novo funcionário. */
export const DEFAULT_EMPLOYEE_PERMISSIONS: PermissionMap = {
  dashboard: { view: true },
  clients: { view: true, create: true, edit: true },
  services: { view: true },
  products: { view: true },
  quotes: { view: true, create: true, edit: true },
  jobs: { view: true, edit: true },
};

/** Normaliza um mapa de permissões vindo de fora, descartando chaves desconhecidas. */
export function sanitizePermissions(input: unknown): PermissionMap {
  const out: PermissionMap = {};
  if (!input || typeof input !== 'object') return out;
  for (const mod of MODULES) {
    const m = (input as Record<string, unknown>)[mod];
    if (!m || typeof m !== 'object') continue;
    const acts: Partial<Record<Action, boolean>> = {};
    for (const a of ACTIONS) if ((m as Record<string, unknown>)[a] === true) acts[a] = true;
    if (Object.keys(acts).length) out[mod] = acts;
  }
  return out;
}
