"use client";

import { AuthProvider } from "@/contexts/auth-context";
import { ThemeProvider } from "./theme-provider";
import { Toaster } from "./ui/sonner";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
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
  );
}
