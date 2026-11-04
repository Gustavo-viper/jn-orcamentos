import type { Quote } from "@/types";
import { mockQuotes } from "@/mocks/quotes";
import { createRepository } from "./storage";

const repository = createRepository<Quote>("quotes", mockQuotes);

export const quoteService = {
  ...repository,
  async list() {
    const quotes = await repository.list();
    const example = mockQuotes.find((quote) => quote.id === "q-demo-gesso-casa-detalhado");
    if (!example || quotes.some((quote) => quote.id === example.id)) return quotes;
    await repository.create(example);
    return [...quotes, example];
  },
};
