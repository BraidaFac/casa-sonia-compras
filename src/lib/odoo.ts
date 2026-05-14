const BASE_URL = `${process.env.ODOO_URL}/json/2`;
const ODOO_DB = process.env.ODOO_DB!;
const ODOO_API_KEY = process.env.ODOO_API_KEY!;

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${ODOO_API_KEY}`,
  "X-Odoo-Database": ODOO_DB,
};

async function request(model: string, method: string, body: object = {}) {
  const response = await fetch(`${BASE_URL}/${model}/${method}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      context: { lang: "es_AR" },
      ...body,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.message || `Odoo error: ${response.status}`);
  }

  return response.json();
}

export const odoo = {
  search: (model: string, domain: unknown[], options?: object) =>
    request(model, "search", { domain, ...options }),

  read: (model: string, ids: number[], fields: string[]) =>
    request(model, "read", { ids, fields }),

  searchRead: (
    model: string,
    domain: unknown[],
    fields: string[],
    options?: object,
  ) => request(model, "search_read", { domain, fields, ...options }),

  // JSON-2 API uses 'vals_list' as param name (not 'values')
  // Normalize: Odoo may return [id] (array) — always return plain number
  create: async (model: string, values: object): Promise<number> => {
    const result = await request(model, "create", { vals_list: values });
    return Array.isArray(result) ? result[0] : result;
  },

  write: (model: string, ids: number[], values: object) =>
    request(model, "write", { ids, vals: values }),

  unlink: (model: string, ids: number[]) => request(model, "unlink", { ids }),

  call: (model: string, method: string, body: object = {}) =>
    request(model, method, body),
};
