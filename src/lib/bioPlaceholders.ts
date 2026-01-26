import { Role } from "@/api/types";

const ROLE_BIO_PLACEHOLDERS: Record<Role, string> = {
  buyer: "Collector of rare digital pieces, always hunting for the next gem.",
  seller: "Independent artist sharing new digital creations with the world.",
};

const DEFAULT_BIO_PLACEHOLDER = "Digital art enthusiast exploring new frontiers.";

export const getRoleBioPlaceholder = (role?: Role | null) => {
  if (role && ROLE_BIO_PLACEHOLDERS[role]) {
    return ROLE_BIO_PLACEHOLDERS[role];
  }
  return DEFAULT_BIO_PLACEHOLDER;
};


