import { AndroidConfig, withAndroidManifest, type ConfigPlugin } from 'expo/config-plugins';

export interface GoogleCredentialManagerPluginOptions {
  serverClientId?: string;
}

const SERVER_CLIENT_ID_META_DATA = 'com.flightontime.google.SERVER_CLIENT_ID';

export const withGoogleCredentialManager: ConfigPlugin<
  GoogleCredentialManagerPluginOptions | undefined
> = (config, options = {}) => {
  const serverClientId =
    options.serverClientId ?? process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

  return withAndroidManifest(config, (manifestConfig) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(
      manifestConfig.modResults,
    );

    if (serverClientId) {
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(
        mainApplication,
        SERVER_CLIENT_ID_META_DATA,
        serverClientId,
      );
    }

    return manifestConfig;
  });
};

export default withGoogleCredentialManager;
