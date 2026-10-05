/**
 * `html5-qrcode` 的最小类型声明。
 *
 * 该包不自带 TypeScript 类型，动态 import 时若不声明，TS 会把 `mod` 推成 `any`，
 * 失去类型检查（实测踩过：摄像头 start 参数写错也不会报错）。
 *
 * 这里只声明本项目实际用到的 API，不追求完整。
 */
declare module 'html5-qrcode' {
  export interface QrCameraConfig {
    facingMode?: string;
    deviceId?: string;
  }

  export interface QrScanConfig {
    fps?: number;
    qrbox?: { width: number; height: number };
    aspectRatio?: number;
    disableFlip?: boolean;
  }

  export class Html5Qrcode {
    constructor(elementId: string, config?: { verbose?: boolean });
    start(
      cameraConfigOrId: QrCameraConfig | string,
      config: QrScanConfig,
      onSuccess: (decodedText: string, result?: unknown) => void,
      onError?: (errorMessage: string) => void,
    ): Promise<void>;
    stop(): Promise<void>;
    clear(): void;
  }
}
