"use client";

import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import Header from "@/components/header";
import { GlobalSearch } from "@/components/global-search";

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
      <GlobalSearch open={globalSearch.isOpen} onOpenChange={globalSearch.setIsOpen} />
    </>
  );
}
