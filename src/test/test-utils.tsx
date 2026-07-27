import { ReactElement, ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Cria um QueryClient isolado — sem retry e sem cache compartilhado com a app.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // gcTime alto para que setQueryData/getQueryData sem observer não seja coletado.
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}


export function renderWithQueryClient(
  ui: ReactElement,
  options: {
    client?: QueryClient;
    renderOptions?: Omit<RenderOptions, "wrapper">;
  } = {},
) {
  const client = options.client ?? createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...render(ui, { wrapper, ...options.renderOptions }) };
}
