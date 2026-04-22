import {
  createBrowserRouter,
  Outlet,
  redirect,
  type RouteObject,
} from "react-router-dom";

import Layout from "../components/layout/Layout";
import ErrorPage from "../components/layout/ErrorPage";
import HydrateFallback from "../components/layout/HydrateFallback";

import Home from "../pages/Home";
import OAuthCallback from "../pages/OAuthCallback";
import Profile from "../pages/Profile";
import BBS from "../pages/BBS";
import Board from "../pages/Board";
import Thread from "../pages/Thread";
import SysopCreate from "../pages/SysopCreate";
import SysopEdit from "../pages/SysopEdit";
import SysopModerate from "../pages/SysopModerate";
import News from "../pages/News";
import NotFound from "../pages/NotFound";

import {
  homeLoader,
  bbsLoader,
  boardLoader,
  profileLoader,
  threadLoader,
  requireAuthLoader,
  sysopEditLoader,
  sysopModerateLoader,
} from "./loaders";

const routes: RouteObject[] = [
  {
    element: <Layout />,
    errorElement: <ErrorPage />,
    HydrateFallback,
    children: [
      { path: "/", loader: homeLoader, element: <Home /> },
      { path: "/oauth/callback", element: <OAuthCallback /> },
      { path: "/account", loader: () => redirect("/") },
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
      },
      {
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
          {
            path: "news/:tid",
            element: <News />,
          },
        ],
      },
      {
        path: "/profile/:handle",
        loader: profileLoader,
        element: <Profile />,
        errorElement: <ErrorPage />,
      },
      { path: "*", element: <NotFound /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
