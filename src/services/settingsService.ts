import type { CompanySettings } from "@/types";
import { delay, queueStorageSync, readStorageAsync, writeStorageAsync } from "./storage";

export const defaultSettings: CompanySettings = {
  name: "J&N Gesso",
  logoText: "J&N",
  document: "18.668.121/0001-71",
  phone: "(54) 98104-9108 / (54) 99712-2390",
  whatsapp: "(54) 99712-2390",
  email: "jefeemoura@gmail.com",
  address: "Rua Santo Vergani, 473",
  city: "",
  state: "",
  zip: "",
  quoteValidityDays: 15,
  defaultMargin: 30,
  downPaymentPercent: 50,
  paymentTerms: "50% de entrada e 50% na conclusão do serviço. Aceitamos PIX, dinheiro e cartão.",
  theme: "light",
};

export const settingsService = {
  async get(): Promise<CompanySettings> {
    await delay(50);
    const saved = await readStorageAsync<Partial<CompanySettings>>("settings", {});
    const settings = { ...defaultSettings, ...saved };
    const legacyDefaults: Partial<CompanySettings> = {
      name: "J & N Decorações em Gesso",
      document: "34.567.890/0001-12",
      phone: "(11) 3456-0000",
      whatsapp: "(11) 99876-5432",
      email: "contato@jngesso.com.br",
      address: "Rua dos Artesãos, 240",
      city: "São Paulo",
      state: "SP",
      zip: "03210-000",
    };
    const migrated = { ...settings };
    let changed = false;
    for (const key of Object.keys(legacyDefaults) as (keyof CompanySettings)[]) {
      if (saved[key] === legacyDefaults[key]) {
        migrated[key] = defaultSettings[key] as never;
        changed = true;
      }
    }
    if (changed) await writeStorageAsync("settings", migrated);
    return migrated;
  },
  async save(s: CompanySettings): Promise<CompanySettings> {
    await delay();
    await writeStorageAsync("settings", s);
    await queueStorageSync("settings", "company", s);
    return s;
  },
};
