import { createContext, useContext } from "react";
export type SiteToolRegistration = {
  supported: boolean;
  count: number;
  error: string | null;
};
export const RegistrationContext = createContext<SiteToolRegistration>({
  supported: false,
  count: 0,
  error: null,
});
export const useSiteToolStatus = () => useContext(RegistrationContext);
