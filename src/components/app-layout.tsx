"use client";

import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import Header from "@/components/header";
import { lazy, Suspense } from "react";

// Lazy load GlobalSearch since it's only needed when user clicks search
const GlobalSearch = lazy(() => import("@/components/global-search").then(mod => ({ default: mod.GlobalSearch })));

type AppLayoutProps = {
  children: React.ReactNode;
};

export function AppLayout({ children }: AppLayoutProps) {
  const globalSearch = useGlobalSearch();

  return (
    <>
      <Header onSearchClick={globalSearch.open} />
      <main className="relative">
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/60 to-background" aria-hidden="true" />
        <div className="relative h-full">
          {children}
        </div>
      </main>
      {globalSearch.isOpen && (
        <Suspense fallback={null}>
          <GlobalSearch open={globalSearch.isOpen} onOpenChange={globalSearch.setIsOpen} />
        </Suspense>
      )}
    </>
  );
}
