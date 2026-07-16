import {
  BookOpen,
  CogIcon,
  File,
  FileText,
  FolderKanban,
  HomeIcon,
  ImageIcon,
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
} & Base<SingletonType>;

const createSingleton = ({ S, type, title, icon }: CreateSingleton) => {
  const newTitle = title ?? getTitleCase(type);
  return S.listItem()
    .title(newTitle)
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
      createSingleton({ S, type: "homePage", title: "Forside", icon: HomeIcon }),
      createList({ S, type: "page", title: "Sider", icon: BookOpen }),
      createList({ S, type: "service", title: "Tjenester", icon: Wrench }),
      createList({ S, type: "projectReference", title: "Referanser", icon: ImageIcon }),
      createList({ S, type: "newsPost", title: "Aktuelt", icon: Newspaper }),
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
                title: "Sideinnstillinger",
                icon: CogIcon,
              }),
              createSingleton({
                S,
                type: "navbar",
                title: "Header og hovedmeny",
                icon: PanelTopDashedIcon,
              }),
              createSingleton({
                S,
                type: "footer",
                title: "Footer",
                icon: PanelBottomIcon,
              }),
            ]),
        ),
      S.divider(),
      createList({ S, type: "faq", title: "FAQ", icon: FileText }),
      createList({ S, type: "blog", title: "Gamle artikler", icon: FolderKanban }),
    ]);
};
