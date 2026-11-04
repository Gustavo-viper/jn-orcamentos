import type { Service } from "@/types";
import { mockServices } from "@/mocks/services";
import { createRepository } from "./storage";

const repository = createRepository<Service>("services", mockServices);

export const serviceService = {
  ...repository,
  async list() {
    const services = await repository.list();
    const knownIds = new Set(services.map((service) => service.id));
    const missingPresets = mockServices.filter((service) => service.id.startsWith("pdf-") && !knownIds.has(service.id));
    for (const service of missingPresets) await repository.create(service);

    // Também instala o serviço Negativo em instalações anteriores que já tenham catálogo salvo.
    const negativePreset = mockServices.find((service) => service.id === "s11");
    const existingNegative = services.find((service) => service.id === "s11");
    if (existingNegative && negativePreset && !existingNegative.fixedRate) {
      await repository.update(existingNegative.id, { fixedRate: true });
      existingNegative.fixedRate = true;
    }
    const hasNegative = services.some((service) => service.id === "s11" || service.name.toLocaleLowerCase("pt-BR") === "negativo");
    const negative = !hasNegative ? negativePreset : undefined;
    if (negative) await repository.create(negative);
    return [...services, ...missingPresets, ...(negative ? [negative] : [])];
  },
};
