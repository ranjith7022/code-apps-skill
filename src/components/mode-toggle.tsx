import { Moon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ModeToggle() {
  return (
    <Button variant="outline" size="icon" disabled title="Dark theme is enabled across the app">
      <Moon className="h-[1.2rem] w-[1.2rem]" />
      <span className="sr-only">Dark theme enabled</span>
    </Button>
  );
}
