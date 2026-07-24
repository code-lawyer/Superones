export type SourceCatalogSectionId = "information-flow" | "statements" | "sic-library" | "sic-rankings";

export type SourceCatalogItem = {
  id: string;
  name: string;
  publisher: string;
  sectionId: SourceCatalogSectionId;
  methodId: string;
  methodLabel: string;
  channelLabel: string;
  destinationLabel: string;
  destinationHref: string;
  sourceUrl: string;
  endpointUrl: string;
  purpose: string;
  nature: string;
  evidenceLabel: string;
  provenance: string;
};

export type SourceCatalogMethod = {
  id: string;
  label: string;
  description: string;
  sources: SourceCatalogItem[];
};

export type SourceCatalogSection = {
  id: SourceCatalogSectionId;
  code: string;
  label: string;
  description: string;
  destinationHref: string;
  methods: SourceCatalogMethod[];
};

export type SourceCatalog = {
  generatedAt: string;
  registryRevision: string;
  total: number;
  governance: {
    xCandidates: number;
    xRunnableCandidates: number;
    xActive: number;
    xExcludedFromRuntime: number;
    xDuplicateDiscoveriesMerged: number;
  };
  sections: SourceCatalogSection[];
};
