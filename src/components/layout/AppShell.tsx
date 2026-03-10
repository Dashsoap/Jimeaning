import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-white">
      <Sidebar />
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 px-8 pb-8 pl-20">{children}</main>
      </div>
    </div>
  );
}
