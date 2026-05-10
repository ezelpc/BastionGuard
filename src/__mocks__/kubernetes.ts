export const KubeConfig = jest.fn().mockImplementation(() => ({
  loadFromCluster: jest.fn(),
  loadFromDefault: jest.fn(),
  loadFromFile: jest.fn(),
  makeApiClient: jest.fn().mockReturnValue({
    patchNamespacedDeployment: jest.fn().mockResolvedValue({}),
    readNamespacedDeployment: jest.fn().mockResolvedValue({
      spec: { replicas: 3 },
      status: { readyReplicas: 3 },
    }),
  }),
}));

export const AppsV1Api = jest.fn();
