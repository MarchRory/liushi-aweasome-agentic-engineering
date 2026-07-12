/** 持久化 Command Reservation 的 Schema 版本。 */
export const COMMAND_RESERVATION_FILE_SCHEMA_VERSION = "1.0.0";

/** Command Gateway 在 Runtime Store 中的目录名。 */
export const COMMAND_GATEWAY_DIRECTORY_NAME = "commandGateway";

/** 单个幂等作用域的 Reservation 文件名。 */
export const COMMAND_RESERVATION_FILE_NAME = "reservation.json";

/** 单个幂等作用域的排他 Lock 文件名。 */
export const COMMAND_RESERVATION_LOCK_FILE_NAME = ".reservation.lock";
