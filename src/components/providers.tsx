"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AuthProvider } from "@/contexts/auth-context";
import { ThemeProvider } from "./theme-provider";
import { Toaster } from "./ui/sonner";

export default function Providers({ children }: { children: React.ReactNode }) {
  // Create a QueryClient instance per component mount to avoid sharing state between requests
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Prevent refetching on window focus in development
        refetchOnWindowFocus: false,
        // Retry failed queries once
        retry: 1,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        disableTransitionOnChange
        enableSystem
      >
        <AuthProvider>
          {children}
          <Toaster richColors />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
