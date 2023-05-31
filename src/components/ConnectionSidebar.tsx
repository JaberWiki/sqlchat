import { Drawer } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConnectionStore, useConversationStore, useLayoutStore, ResponsiveWidth, useSettingStore } from "@/store";
import { Engine, Table, Schema } from "@/types";
import useLoading from "@/hooks/useLoading";
import Select from "./kit/Select";
import Icon from "./Icon";
import DarkModeSwitch from "./DarkModeSwitch";
import ConnectionList from "./Sidebar/ConnectionList";
import QuotaView from "./QuotaView";
import { countTextTokens, getModel, hasFeature } from "../utils";
import SettingAvatarIcon from "./SettingAvatarIcon";
import Checkbox from "./kit/Checkbox";

interface State {}

const ConnectionSidebar = () => {
  const { t } = useTranslation();
  const settingStore = useSettingStore();
  const layoutStore = useLayoutStore();
  const connectionStore = useConnectionStore();
  const conversationStore = useConversationStore();
  const [isRequestingDatabase, setIsRequestingDatabase] = useState<boolean>(false);
  const currentConnectionCtx = connectionStore.currentConnectionCtx;
  const databaseList = connectionStore.databaseList.filter((database) => database.connectionId === currentConnectionCtx?.connection.id);
  const [tableList, updateTableList] = useState<Table[]>([]);
  const [schemaList, updateSchemaList] = useState<Schema[]>([]);
  const [hasSchemaProperty, updateHasSchemaProperty] = useState<boolean>(false);
  const selectedTablesName: string[] =
    conversationStore.getConversationById(conversationStore.currentConversationId)?.selectedTablesName || [];
  const selectedSchemaName: string =
    conversationStore.getConversationById(conversationStore.currentConversationId)?.selectedSchemaName || "";
  const tableSchemaLoadingState = useLoading();
  const currentConversation = conversationStore.getConversationById(conversationStore.currentConversationId);
  const maxToken = getModel(settingStore.setting.openAIApiConfig?.model || "").max_token;
  const [totalToken, setTotalToken] = useState<number>(0);
  useEffect(() => {
    updateHasSchemaProperty(
      currentConnectionCtx?.connection.engineType === Engine.PostgreSQL || currentConnectionCtx?.connection.engineType === Engine.MSSQL
    );
  }, [currentConnectionCtx?.connection]);

  useEffect(() => {
    updateHasSchemaProperty(
      currentConnectionCtx?.connection.engineType === Engine.PostgreSQL || currentConnectionCtx?.connection.engineType === Engine.MSSQL
    );
  }, [currentConnectionCtx?.connection]);

  useEffect(() => {
    const handleWindowResize = () => {
      if (window.innerWidth < ResponsiveWidth.sm) {
        layoutStore.toggleSidebar(false);
        layoutStore.setIsMobileView(true);
      } else {
        layoutStore.toggleSidebar(true);
        layoutStore.setIsMobileView(false);
      }
    };

    handleWindowResize();
    window.addEventListener("resize", handleWindowResize);

    return () => {
      window.removeEventListener("resize", handleWindowResize);
    };
  }, []);

  useEffect(() => {
    // update total token
    const totalToken = selectedTablesName.reduce((totalToken, tableName) => {
      const table = tableList.find((table) => table.name === tableName);
      // because old cache didn't have token, So the value may is undefined.
      return totalToken + (table?.token || countTextTokens(table?.structure || ""));
    }, 0);
    setTotalToken(totalToken);
  }, [selectedTablesName, tableList]);

  useEffect(() => {
    if (currentConnectionCtx?.connection) {
      setIsRequestingDatabase(true);
      connectionStore.getOrFetchDatabaseList(currentConnectionCtx.connection).finally(() => {
        setIsRequestingDatabase(false);
        const database = databaseList.find(
          (database) => database.name === useConnectionStore.getState().currentConnectionCtx?.database?.name
        );
        if (database) {
          tableSchemaLoadingState.setLoading();
          connectionStore.getOrFetchDatabaseSchema(database).then(() => {
            tableSchemaLoadingState.setFinish();
          });
        }
      });
    } else {
      setIsRequestingDatabase(false);
    }
  }, [currentConnectionCtx?.connection]);

  useEffect(() => {
    const schemaList =
      connectionStore.databaseList.find(
        (database) =>
          database.connectionId === currentConnectionCtx?.connection.id && database.name === currentConnectionCtx?.database?.name
      )?.schemaList || [];

    updateSchemaList(schemaList);
    // need to create a conversation. otherwise updateSelectedSchemaName will failed.
    createConversation();
    if (hasSchemaProperty) {
      conversationStore.updateSelectedSchemaName(schemaList[0]?.name || "");
    } else {
      conversationStore.updateSelectedSchemaName("");
    }
  }, [connectionStore, hasSchemaProperty, currentConnectionCtx, schemaList]);

  useEffect(() => {
    const tableList = schemaList.find((schema) => schema.name === selectedSchemaName)?.tables || [];
    updateTableList(tableList);
  }, [selectedSchemaName, selectedTablesName, schemaList]);

  const handleDatabaseNameSelect = async (databaseName: string) => {
    if (!currentConnectionCtx?.connection) {
      return;
    }

    const databaseList = await connectionStore.getOrFetchDatabaseList(currentConnectionCtx.connection);
    const database = databaseList.find((database) => database.name === databaseName);
    connectionStore.setCurrentConnectionCtx({
      connection: currentConnectionCtx.connection,
      database: database,
    });
    if (database) {
      tableSchemaLoadingState.setLoading();
      connectionStore.getOrFetchDatabaseSchema(database).then(() => {
        tableSchemaLoadingState.setFinish();
      });
    }
  };

  // only create conversation when currentConversation is null.
  // Note: This function is used to solve issue #95
  //       https://github.com/sqlchat/sqlchat/issues/95
  const createConversation = () => {
    if (!currentConversation) {
      if (!currentConnectionCtx) {
        conversationStore.createConversation();
      } else {
        conversationStore.createConversation(currentConnectionCtx.connection.id, currentConnectionCtx.database?.name);
      }
    }
  };

  const handleTableCheckboxChange = async (tableName: string, value: boolean) => {
    if (value) {
      conversationStore.updateSelectedTablesName([...selectedTablesName, tableName]);
    } else {
      conversationStore.updateSelectedTablesName(selectedTablesName.filter((name) => name !== tableName));
    }
  };

  const handleSchemaNameSelect = async (schemaName: string) => {
    // need to empty selectedTablesName when schemaName changed. because selectedTablesName may not exist in new schema.
    conversationStore.updateSelectedTablesName([]);
    conversationStore.updateSelectedSchemaName(schemaName);
  };

  return (
    <>
      <Drawer
        className="!z-10"
        variant={layoutStore.isMobileView ? "temporary" : "persistent"}
        open={layoutStore.showSidebar}
        onClose={() => layoutStore.toggleSidebar(false)}
        ModalProps={{ disablePortal: true }}
      >
        <div className="w-80 h-full overflow-y-hidden flex flex-row justify-start items-start">
          <div className="w-16 h-full bg-gray-200 dark:bg-zinc-600 pl-2 py-4 pt-6 flex flex-col justify-between items-center">
            <div className="w-full flex flex-col justify-start items-start">
              <ConnectionList />
            </div>
            <div className="w-full flex flex-col space-y-2 justify-end items-center">
              <DarkModeSwitch />
              <SettingAvatarIcon />
            </div>
          </div>
          <div className="relative p-4 pb-0 w-64 h-full overflow-y-auto flex flex-col justify-start items-start bg-gray-100 dark:bg-zinc-700">
            <img className="px-4 shrink-0" src="/chat-logo.webp" alt="" />
            <div className="w-full grow">
              {isRequestingDatabase && (
                <div className="w-full h-12 flex flex-row justify-start items-center px-4 sticky top-0 border z-1 mb-4 mt-2 rounded-lg text-sm text-gray-600 dark:text-gray-400">
                  <Icon.BiLoaderAlt className="w-4 h-auto animate-spin mr-1" /> {t("common.loading")}
                </div>
              )}
              {databaseList.length > 0 && (
                <div className="w-full sticky top-0 z-1 my-4">
                  <Select
                    className="w-full px-4 py-3 !text-base mb-2"
                    value={currentConnectionCtx?.database?.name}
                    itemList={databaseList.map((database) => {
                      return {
                        label: database.name,
                        value: database.name,
                      };
                    })}
                    onValueChange={(databaseName) => handleDatabaseNameSelect(databaseName)}
                    placeholder={t("connection.select-database") || ""}
                  />
                </div>
              )}
              {hasSchemaProperty && schemaList.length > 0 && (
                <Select
                  className="w-full px-4 py-3 !text-base mb-2"
                  value={selectedSchemaName}
                  itemList={schemaList.map((schema) => {
                    return {
                      label: schema.name,
                      value: schema.name,
                    };
                  })}
                  onValueChange={(schema) => handleSchemaNameSelect(schema)}
                  placeholder={t("connection.select-schema") || ""}
                />
              )}
              {currentConnectionCtx &&
                (tableSchemaLoadingState.isLoading ? (
                  <div className="w-full h-12 flex flex-row justify-start items-center px-4 sticky top-0 z-1 mb-4 mt-2 rounded-lg text-sm text-gray-600 dark:text-gray-400">
                    <Icon.BiLoaderAlt className="w-4 h-auto animate-spin mr-1" /> {t("common.loading")}
                  </div>
                ) : (
                  tableList.length > 0 &&
                  tableList.map((table) => {
                    return (
                      <div key={table.name}>
                        <Checkbox
                          value={selectedTablesName.includes(table.name)}
                          label={table.name}
                          onValueChange={handleTableCheckboxChange}
                        >
                          <div className="text-gray-700 text-sm dark:text-gray-300">{table.token || countTextTokens(table.structure)}</div>
                        </Checkbox>
                      </div>
                    );
                  })
                ))}
            </div>

            <div className="sticky bottom-0 w-full flex flex-col justify-center bg-gray-100 dark:bg-zinc-700 backdrop-blur bg-opacity-60 pb-4 py-2">
              {currentConnectionCtx && (
                <div className="flex justify-between text-sm text-gray-700 dark:text-gray-300 mb-2">
                  <div>{t("connection.total-token")}</div>
                  <div>
                    {totalToken}/{maxToken}
                  </div>
                </div>
              )}
              {!settingStore.setting.openAIApiConfig?.key && hasFeature("quota") && (
                <div className="mb-4">
                  <QuotaView />
                </div>
              )}
              <a
                className="dark:hidden"
                href="https://www.producthunt.com/posts/sql-chat-2?utm_source=badge-featured&utm_medium=badge&utm_souce=badge-sql&#0045;chat&#0045;2"
                target="_blank"
              >
                <img
                  src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=390216&theme=light"
                  alt="SQL&#0032;Chat - ChatGPT&#0032;powered&#0032;SQL&#0032;client&#0032;for&#0032;Postgres&#0044;&#0032;MySQL&#0032;&#0038;&#0032;SQL&#0032;Server | Product Hunt"
                  style={{ width: "250px", height: "54px" }}
                  width="250"
                  height="54"
                />
              </a>
              <a
                className="hidden dark:block"
                href="https://www.producthunt.com/posts/sql-chat-2?utm_source=badge-featured&utm_medium=badge&utm_souce=badge-sql&#0045;chat&#0045;2"
                target="_blank"
              >
                <img
                  src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=390216&theme=dark"
                  alt="SQL&#0032;Chat - ChatGPT&#0032;powered&#0032;SQL&#0032;client&#0032;for&#0032;Postgres&#0044;&#0032;MySQL&#0032;&#0038;&#0032;SQL&#0032;Server | Product Hunt"
                  style={{ width: "250px", height: "54px" }}
                  width="250"
                  height="54"
                />
              </a>
            </div>
          </div>
        </div>
      </Drawer>
    </>
  );
};

export default ConnectionSidebar;
