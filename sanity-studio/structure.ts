import {
  BookOpen,
  CogIcon,
  File,
  FileText,
  FolderKanban,
  HomeIcon,
  ImageIcon,
  LinkIcon,
  Newspaper,
  PanelBottomIcon,
  PanelTopDashedIcon,
  Settings2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type {
  StructureBuilder,
  StructureResolverContext,
} from "sanity/structure";

import type { SchemaType, SingletonType } from "./schemaTypes";
import { getTitleCase } from "./utils/helper";

type Base<T = SchemaType> = {
  id?: string;
  type: T;
  title?: string;
  icon?: LucideIcon;
};

type CreateSingleton = {
  S: StructureBuilder;
} & Omit<Base<SingletonType>, "title">;

const createSingleton = ({ S, type, icon }: CreateSingleton) => {
  return S.documentListItem({ id: type, schemaType: type })
    .icon(icon ?? File)
    .child(S.document().schemaType(type).documentId(type));
};

type CreateList = {
  S: StructureBuilder;
} & Base;

const createList = ({ S, type, icon, title, id }: CreateList) => {
  const newTitle = title ?? getTitleCase(type);
  return S.documentTypeListItem(type)
    .id(id ?? type)
    .title(newTitle)
    .icon(icon ?? File);
};

export const structure = (
  S: StructureBuilder,
  _context: StructureResolverContext,
) => {
  return S.list()
    .title("Fiskum innhold")
    .items([
      createSingleton({ S, type: "homePage", icon: HomeIcon }),
      createList({ S, type: "page", title: "Sider", icon: BookOpen }),
      createList({ S, type: "service", title: "Tjenester", icon: Wrench }),
      createList({ S, type: "projectReference", title: "Referanser", icon: ImageIcon }),
      createList({ S, type: "newsPost", title: "Aktuelt", icon: Newspaper }),
      createList({ S, type: "redirect", title: "URL-videresendinger", icon: LinkIcon }),
      S.divider(),
      S.listItem()
        .title("Globale innstillinger")
        .icon(Settings2)
        .child(
          S.list()
            .title("Globale innstillinger")
            .items([
              createSingleton({
                S,
                type: "settings",
                icon: CogIcon,
              }),
              createSingleton({
                S,
                type: "navbar",
                icon: PanelTopDashedIcon,
              }),
              createSingleton({
                S,
                type: "footer",
                icon: PanelBottomIcon,
              }),
            ]),
        ),
      S.divider(),
      createList({ S, type: "faq", title: "FAQ", icon: FileText }),
      createList({ S, type: "blog", title: "Gamle artikler", icon: FolderKanban }),
    ]);
};
