import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="h-full grid place-items-center">
      <div className="text-center space-y-4">
        <div className="text-6xl font-bold tabular-nums tracking-tighter text-muted-foreground/30">
          404
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Page not found</h1>
          <p className="text-sm text-muted-foreground mt-1">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/">Back to workspace</Link>
        </Button>
      </div>
    </div>
  );
}
