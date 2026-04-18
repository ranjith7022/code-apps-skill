import { Suspense, lazy } from "react";
import { createBrowserRouter } from "react-router-dom";
import Layout from "@/pages/_layout";
import HomePage from "@/pages/home";
import NotFoundPage from "@/pages/not-found";

const AccountsPage = lazy(() => import("@/pages/accounts"));
const AccountEditPage = lazy(() => import("@/pages/account-edit"));
const FluentSamplePage = lazy(() => import("@/pages/fluent-sample"));
const WriteTestPage = lazy(() => import("@/pages/write-test"));
const UploadTestPage = lazy(() => import("@/pages/upload-test"));
const ExperimentsPage = lazy(() => import("@/pages/experiments"));

function lazyElement(Component: React.ComponentType) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading...</div>}>
      <Component />
    </Suspense>
  );
}

// IMPORTANT: Do not remove or modify the code below!
// Normalize basename when hosted in Power Apps
const BASENAME = new URL(".", location.href).pathname;
if (location.pathname.endsWith("/index.html")) {
  history.replaceState(null, "", BASENAME + location.search + location.hash);
}

export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Layout />,
      errorElement: <NotFoundPage />,
      children: [
        { index: true, element: <HomePage /> },
        { path: "sample-feature", element: lazyElement(FluentSamplePage) },
        { path: "accounts", element: lazyElement(AccountsPage) },
        { path: "accounts/:accountId/edit", element: lazyElement(AccountEditPage) },
        { path: "write-test", element: lazyElement(WriteTestPage) },
        { path: "upload-test", element: lazyElement(UploadTestPage) },
        { path: "experiments", element: lazyElement(ExperimentsPage) },
      ],
    },
  ],
  {
    basename: BASENAME, // IMPORTANT: Set basename for proper routing when hosted in Power Apps
  },
);
