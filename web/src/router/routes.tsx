import {
  createBrowserRouter,
  Outlet,
  type RouteObject,
} from "react-router-dom";

import Layout from "../components/Layout";
import ErrorPage from "../components/ErrorPage";

import Home from "../pages/Home";
import Login from "../pages/Login";
import OAuthCallback from "../pages/OAuthCallback";
import BBS from "../pages/BBS";
import Board from "../pages/Board";
import Thread from "../pages/Thread";
import Account from "../pages/Account";
import SysopCreate from "../pages/SysopCreate";
import SysopEdit from "../pages/SysopEdit";
import SysopModerate from "../pages/SysopModerate";
import NotFound from "../pages/NotFound";

import {
  bbsLoader,
  boardLoader,
  threadLoader,
  accountLoader,
  requireAuthLoader,
  sysopEditLoader,
  sysopModerateLoader,
} from "./loaders";

// errorElement on each child keeps failures inside the layout's outlet.
const routes: RouteObject[] = [
  {
    element: <Layout />,
    errorElement: <ErrorPage />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/login", element: <Login /> },
      { path: "/oauth/callback", element: <OAuthCallback /> },
      {
        path: "/account",
        loader: accountLoader,
        element: <Account />,
        errorElement: <ErrorPage />,
      },
      {
        path: "/account/create",
        loader: requireAuthLoader,
        element: <SysopCreate />,
        errorElement: <ErrorPage />,
      },
      {
        path: "/account/edit",
        loader: sysopEditLoader,
        element: <SysopEdit />,
        errorElement: <ErrorPage />,
      },
      {
        path: "/account/moderate",
        loader: sysopModerateLoader,
        element: <SysopModerate />,
        errorElement: <ErrorPage />,
      },
      {
        // BBS section: parent loader resolves the BBS once. Child routes
        // grab it via useRouteLoaderData("bbs").
        path: "/bbs/:handle",
        id: "bbs",
        loader: bbsLoader,
        element: <Outlet />,
        errorElement: <ErrorPage />,
        children: [
          { index: true, element: <BBS /> },
          {
            path: "board/:slug",
            loader: boardLoader,
            element: <Board />,
            errorElement: <ErrorPage />,
          },
          {
            path: "thread/:did/:tid",
            loader: threadLoader,
            element: <Thread />,
            errorElement: <ErrorPage />,
          },
        ],
      },
      { path: "*", element: <NotFound /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
