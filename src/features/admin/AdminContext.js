import { createContext, useContext } from "react";

export const AdminContext = createContext(null);
export const useAdminContext = () => useContext(AdminContext);
