import { EntityRepository, Repository, Brackets } from "typeorm";
import {
  GenericConditionalTransferAppName,
  ConditionalTransferAppNames,
  SimpleLinkedTransferAppName,
} from "@connext/types";

import { AppInstance, AppType } from "../appInstance/appInstance.entity";
import { AppRegistry } from "src/appRegistry/appRegistry.entity";

@EntityRepository(AppInstance)
export class TransferRepository extends Repository<AppInstance> {
  findInstalledTransferAppsByPaymentId<
    T extends ConditionalTransferAppNames = typeof GenericConditionalTransferAppName
  >(paymentId: string): Promise<AppInstance<T>[]> {
    return this.createQueryBuilder("app_instance")
      .leftJoinAndSelect("app_instance.channel", "channel")
      .andWhere("app_instance.type = :type", { type: AppType.INSTANCE })
      .andWhere(`app_instance."latestState"::JSONB @> '{ "paymentId": "${paymentId}" }'`)
      .getMany() as Promise<AppInstance<T>[]>;
  }

  findTransferAppByPaymentIdAndSender<
    T extends ConditionalTransferAppNames = typeof GenericConditionalTransferAppName
  >(paymentId: string, senderSignerAddress: string): Promise<AppInstance<T> | undefined> {
    return this.createQueryBuilder("app_instance")
      .leftJoinAndSelect("app_instance.channel", "channel")
      .andWhere(`app_instance."meta"::JSONB @> '{ "paymentId": "${paymentId}" }'`)
      .andWhere(
        `app_instance."latestState"::JSONB #> '{"coinTransfers",0,"to"}' = '"${senderSignerAddress}"'`,
      )
      .getOne() as Promise<AppInstance<T>>;
  }

  findTransferAppByPaymentIdAndReceiver<
    T extends ConditionalTransferAppNames = typeof GenericConditionalTransferAppName
  >(paymentId: string, receiverSignerAddress: string): Promise<AppInstance<T> | undefined> {
    return this.createQueryBuilder("app_instance")
      .leftJoinAndSelect("app_instance.channel", "channel")
      .andWhere(`app_instance."meta"::JSONB @> '{ "paymentId": "${paymentId}" }'`)
      .andWhere(
        `app_instance."latestState"::JSONB #> '{"coinTransfers",1,"to"}' = '"${receiverSignerAddress}"'`,
      )
      .getOne() as Promise<AppInstance<T>>;
  }

  async findLinkedTransferAppsBySenderAddress(senderAddress: string): Promise<AppInstance[]> {
    const res = await this.createQueryBuilder("app_instance")
      .leftJoinAndSelect(
        AppRegistry,
        "app_registry",
        "app_registry.appDefinitionAddress = app_instance.appDefinition",
      )
      .leftJoinAndSelect("app_instance.channel", "channel")
      .where("app_registry.name = :name", { name: SimpleLinkedTransferAppName })
      .andWhere(
        new Brackets((qb) => {
          qb.where(
            `app_instance."latestState"::JSONB #> '{"coinTransfers",0,"to"}' = '"${senderAddress}"'`,
          ).orWhere(
            `app_instance."latestState"::JSONB #> '{"coinTransfers",1,"to"}' = '"${senderAddress}"'`,
          );
        }),
      )
      .getMany();
    return res;
  }
}
