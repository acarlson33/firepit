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
      <Suspense fallback={null}>
        <Header onSearchClick={globalSearch.open} />
      </Suspense>
      <main className="relative flex-1 overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-primary/10 via-background/40 to-transparent"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background via-background/70 to-transparent"
        />
        <div className="relative min-h-full">
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
