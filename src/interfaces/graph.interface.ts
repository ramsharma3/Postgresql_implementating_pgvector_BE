export interface GraphNode {
  id: string;
  label: string;
  name?: string;
  color?: string;
  properties: Record<string, any>;
  degree?: number;
}

export interface GraphLink {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, any>;
}

export interface SubGraphPayload {
  centerNodeId?: string;
  depth?: number;
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface GraphStatsPayload {
  totalNodes: number;
  totalRelationships: number;
  nodesByLabel: Record<string, number>;
  relationshipsByType: Record<string, number>;
}
