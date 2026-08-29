export function isWebGL2Supported(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return true;
  }
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    return gl !== null;
  } catch {
    return false;
  }
}
