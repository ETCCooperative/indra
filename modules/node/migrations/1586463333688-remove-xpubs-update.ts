import { MigrationInterface, QueryRunner } from "typeorm";

export class removeXpubsUpdate1586463333688 implements MigrationInterface {
  name = "removeXpubsUpdate1586463333688";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = 'VIEW' AND "schema" = $1 AND "name" = $2`,
      ["public", "anonymized_onchain_transaction"],
    );
    await queryRunner.query(`DROP VIEW "anonymized_onchain_transaction"`, undefined);
    await queryRunner.query(
      `ALTER TABLE "app_instance" RENAME COLUMN "initiatorDepositTokenAddress" TO "initiatorDepositAssetId"`,
      undefined,
    );
    await queryRunner.query(
      `ALTER TABLE "app_instance" RENAME COLUMN "proposedByIdentifier" TO "initiatorIdentifier"`,
      undefined,
    );
    await queryRunner.query(
      `ALTER TABLE "app_instance" RENAME COLUMN "proposedToIdentifier" TO "responderIdentifier"`,
      undefined,
    );
    await queryRunner.query(
      `ALTER TABLE "app_instance" RENAME COLUMN "responderDepositTokenAddress" TO "responderDepositAssetId"`,
      undefined,
    );
    await queryRunner.query(
      `CREATE VIEW "anonymized_onchain_transaction" AS 
  SELECT
    "onchain_transaction"."createdAt" as "createdAt",
    "onchain_transaction"."reason" as "reason",
    "onchain_transaction"."value" as "value",
    "onchain_transaction"."gasPrice" as "gasPrice",
    "onchain_transaction"."gasLimit" as "gasLimit",
    "onchain_transaction"."to" as "to",
    "onchain_transaction"."from" as "from",
    "onchain_transaction"."hash" as "hash",
    "onchain_transaction"."data" as "data",
    "onchain_transaction"."nonce" as "nonce",
    encode(digest("channel"."userPublicIdentifier", 'sha256'), 'hex') as "publicIdentifier"
  FROM "onchain_transaction"
    LEFT JOIN "channel" ON "channel"."id" = "onchain_transaction"."channelId"
  `,
      undefined,
    );
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("type", "schema", "name", "value") VALUES ($1, $2, $3, $4)`,
      [
        "VIEW",
        "public",
        "anonymized_onchain_transaction",
        'SELECT\n    "onchain_transaction"."createdAt" as "createdAt",\n    "onchain_transaction"."reason" as "reason",\n    "onchain_transaction"."value" as "value",\n    "onchain_transaction"."gasPrice" as "gasPrice",\n    "onchain_transaction"."gasLimit" as "gasLimit",\n    "onchain_transaction"."to" as "to",\n    "onchain_transaction"."from" as "from",\n    "onchain_transaction"."hash" as "hash",\n    "onchain_transaction"."data" as "data",\n    "onchain_transaction"."nonce" as "nonce",\n    encode(digest("channel"."userPublicIdentifier", \'sha256\'), \'hex\') as "publicIdentifier"\n  FROM "onchain_transaction"\n    LEFT JOIN "channel" ON "channel"."id" = "onchain_transaction"."channelId"',
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = 'VIEW' AND "schema" = $1 AND "name" = $2`,
      ["public", "anonymized_onchain_transaction"],
    );
    await queryRunner.query(`DROP VIEW "anonymized_onchain_transaction"`, undefined);
    await queryRunner.query(
      `ALTER TABLE "app_instance" RENAME COLUMN "initiatorDepositAssetId" TO "initiatorDepositTokenAddress"`,
      undefined,
    );
    await queryRunner.query(
      `ALTER TABLE "app_instance" RENAME COLUMN "initiatorIdentifier" TO "proposedByIdentifier"`,
      undefined,
    );
    await queryRunner.query(
      `ALTER TABLE "app_instance" RENAME COLUMN "responderIdentifier" TO "proposedToIdentifier"`,
      undefined,
    );
    await queryRunner.query(
      `ALTER TABLE "app_instance" RENAME COLUMN "responderDepositAssetId" TO "responderDepositTokenAddress"`,
      undefined,
    );
    await queryRunner.query(
      `CREATE VIEW "anonymized_onchain_transaction" AS SELECT
    "onchain_transaction"."createdAt" as "createdAt",
    "onchain_transaction"."reason" as "reason",
    "onchain_transaction"."value" as "value",
    "onchain_transaction"."gasPrice" as "gasPrice",
    "onchain_transaction"."gasLimit" as "gasLimit",
    "onchain_transaction"."to" as "to",
    "onchain_transaction"."from" as "from",
    "onchain_transaction"."hash" as "hash",
    "onchain_transaction"."data" as "data",
    "onchain_transaction"."nonce" as "nonce",
    encode(digest("channel"."userPublicIdentifier", 'sha256'), 'hex') as "channelIdentifier"
  FROM "onchain_transaction"
    LEFT JOIN "channel" ON "channel"."id" = "onchain_transaction"."channelId"`,
      undefined,
    );
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("type", "schema", "name", "value") VALUES ($1, $2, $3, $4)`,
      [
        "VIEW",
        "public",
        "anonymized_onchain_transaction",
        'SELECT\n    "onchain_transaction"."createdAt" as "createdAt",\n    "onchain_transaction"."reason" as "reason",\n    "onchain_transaction"."value" as "value",\n    "onchain_transaction"."gasPrice" as "gasPrice",\n    "onchain_transaction"."gasLimit" as "gasLimit",\n    "onchain_transaction"."to" as "to",\n    "onchain_transaction"."from" as "from",\n    "onchain_transaction"."hash" as "hash",\n    "onchain_transaction"."data" as "data",\n    "onchain_transaction"."nonce" as "nonce",\n    encode(digest("channel"."userPublicIdentifier", \'sha256\'), \'hex\') as "channelIdentifier"\n  FROM "onchain_transaction"\n    LEFT JOIN "channel" ON "channel"."id" = "onchain_transaction"."channelId"',
      ],
    );
  }
}
