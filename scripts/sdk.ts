export interface SDKOptions {
  baseUrl: string;
}

export function bootstrapSDK(options: SDKOptions) {
  console.log('Injecting recorder SDK with options', options);
}
