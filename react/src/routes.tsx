import { createBrowserRouter, type RouteObject } from "react-router-dom";
import Layout from "./components/Layout";
import BBSOutlet from "./components/BBSOutlet";
import ErrorPage from "./components/ErrorPage";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Callback from "./pages/Callback";
import Site from "./pages/Site";
import Board from "./pages/Board";
import Thread from "./pages/Thread";
import Account from "./pages/Account";
import SysopCreate from "./pages/SysopCreate";
import SysopEdit from "./pages/SysopEdit";
import SysopModerate from "./pages/SysopModerate";
import NotFound from "./pages/NotFound";
import {
  bbsLoader,
  boardLoader,
  threadLoader,
  accountLoader,
  requireAuthLoader,
  sysopEditLoader,
  sysopModerateLoader,
} from "./loaders";

const routes: RouteObject[] = [
  {
    element: <Layout />,
    errorElement: <ErrorPage />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/login", element: <Login /> },
      { path: "/oauth/callback", element: <Callback /> },
      {
        path: "/account",
        loader: accountLoader,
        element: <Account />,
      },
      {
        path: "/account/create",
        loader: requireAuthLoader,
        element: <SysopCreate />,
      },
      {
        path: "/account/edit",
        loader: sysopEditLoader,
        element: <SysopEdit />,
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
        element: <BBSOutlet />,
        children: [
          { index: true, element: <Site /> },
          {
            path: "board/:slug",
            loader: boardLoader,
            element: <Board />,
          },
          {
            path: "thread/:did/:tid",
            loader: threadLoader,
            element: <Thread />,
          },
        ],
      },
      { path: "*", element: <NotFound /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
