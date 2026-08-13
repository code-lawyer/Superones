export type SourceCatalogSectionId =
  | "information-flow"
  | "roadside"
  | "documents"
  | "papers"
  | "podcasts"
  | "courses"
  | "sic-rankings";

export type SourceCatalogItem = {
  id: string;
  name: string;
  publisher: string;
  sectionId: SourceCatalogSectionId;
  channelLabel: string;
  destinationLabel: string;
  destinationHref: string;
  sourceUrl: string;
  nature: string;
  evidenceLabel: string;
};

export type SourceCatalogSection = {
  id: SourceCatalogSectionId;
  code: string;
  label: string;
  description: string;
  destinationHref: string;
  sources: SourceCatalogItem[];
};

export type SourceCatalog = {
  total: number;
  sections: SourceCatalogSection[];
};
