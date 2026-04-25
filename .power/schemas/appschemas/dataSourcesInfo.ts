/*!
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * This file is auto-generated. Do not modify it manually.
 * Changes to this file may be overwritten.
 */

export const dataSourcesInfo = {
  accounts: {
    tableId: "",
    version: "",
    primaryKey: "accountid",
    dataSourceType: "Dataverse",
    apis: {},
  },
  contacts: {
    tableId: "",
    version: "",
    primaryKey: "contactid",
    dataSourceType: "Dataverse",
    apis: {},
  },
  whoami: {
    tableId: "",
    version: "",
    primaryKey: "",
    dataSourceType: "Dataverse",
    apis: {
      WhoAmI: {
        path: "/api/data/v9.2/WhoAmI",
        method: "GET",
        parameters: [],
        responseInfo: {
          "200": {
            type: "object",
          },
        },
      },
    },
  },
  global_getcurrentdataverseurl: {
    tableId: "",
    version: "",
    primaryKey: "",
    dataSourceType: "Connector",
    apis: {
      Run: {
        path: "/{connectionId}/triggers/manual/run",
        method: "POST",
        parameters: [
          {
            name: "connectionId",
            in: "path",
            required: true,
            type: "string",
          },
          {
            name: "input",
            in: "body",
            required: true,
            type: "object",
          },
          {
            name: "api-version",
            in: "query",
            required: true,
            type: "string",
          },
        ],
        responseInfo: {
          "200": {
            type: "object",
          },
          default: {
            type: "object",
          },
        },
      },
    },
  },
  setupwizard_getsolutionenvironmentvariabledefinitionsdetails: {
    tableId: "",
    version: "",
    primaryKey: "",
    dataSourceType: "Connector",
    apis: {
      Run: {
        path: "/{connectionId}/triggers/manual/run",
        method: "POST",
        parameters: [
          {
            name: "connectionId",
            in: "path",
            required: true,
            type: "string",
          },
          {
            name: "input",
            in: "body",
            required: true,
            type: "object",
          },
          {
            name: "api-version",
            in: "query",
            required: true,
            type: "string",
          },
        ],
        responseInfo: {
          "200": {
            type: "object",
          },
          default: {
            type: "object",
          },
        },
      },
    },
  },
};
