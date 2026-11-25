// Error yang sudah "berniat" dikirim ke client (bukan bug tak terduga).
//
// Bedanya dengan Error biasa:
//   - statusCode menentukan kode HTTP pada response.
//   - code adalah penanda tetap yang bisa dibaca program (mis. mobile app),
//     sehingga client tidak perlu menebak dari kalimat pesannya.
//
// Error yang BUKAN AppError dianggap bug server dan dijawab HTTP 500 dengan
// pesan generik, supaya detail internal tidak ikut bocor.
class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }

  // 400 - data yang dikirim tidak memenuhi aturan
  static badRequest(message, code = 'VALIDATION_ERROR') {
    return new AppError(400, code, message);
  }

  // 401 - belum masuk / token tidak sah
  static unauthorized(message, code = 'UNAUTHORIZED') {
    return new AppError(401, code, message);
  }

  // 403 - sudah masuk, tetapi tidak punya hak
  static forbidden(message, code = 'FORBIDDEN') {
    return new AppError(403, code, message);
  }

  // 404 - data tidak ada
  static notFound(message, code = 'NOT_FOUND') {
    return new AppError(404, code, message);
  }

  // 409 - bentrok dengan keadaan data saat ini
  static conflict(message, code = 'CONFLICT') {
    return new AppError(409, code, message);
  }

  // 503 - server belum siap (mis. konfigurasi belum diisi)
  static serviceUnavailable(message, code = 'SERVICE_UNAVAILABLE') {
    return new AppError(503, code, message);
  }
}

module.exports = AppError;
