import type { Client } from "@/types";
import { mockClients } from "@/mocks/clients";
import { createRepository } from "./storage";

const repository = createRepository<Client>("clients", mockClients);

export const clientService = {
  ...repository,
  async list() {
    const clients = await repository.list();
    const demoClient = mockClients.find((client) => client.id === "c-demo-liliane");
    if (!demoClient || clients.some((client) => client.id === demoClient.id)) return clients;
    await repository.create(demoClient);
    return [...clients, demoClient];
  },
};
