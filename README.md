# Schematic Bot (serverless)

## What is this?
This Discord bot (more of an interaction handler) is supposed to grab schematics from a Pterodactyl game server instance, running a Minecraft version, which supports WorldEdit (as opposed to FastAsyncWorldEdit, support for that will be added in later versions, as NABS updates to newer Minecraft instances).

## Assumed values
These values are assumed (based on our current setup, more modularity will be added later):

|Name|Value|
|--|--|
| WorldEdit Directory | `/plugins/WorldEdit/schematics/` |

These values must be added as environment variables when deploying: 

|Name|Description|
|--|--|
| PublicKey | This is the public key of your Discord application. |
| Token | This is the token of your Discord bot.
| ApplicationID | This is the ID of your Discord application.
| ServerID | This is the ID of your Pterodactyl server (will in the future be autocomplete-selectable in the commands). |
| PterodactylToken | This is the API token of your Pterodactyl user account (must have proper privileges).
| PterodactylURL | This is the url of your Pterodactyl instance in the following format: `https://domain.tld`.

(use [example.settings.json](https://github.com/BTE-Carolinas/schematic-serverless/blob/main/example.settings.json) for further reference)


## Features

| Command | Function |
|--|--|
| `/schematic download` | This grabs a file from the WorldEdit directory and uploads it to the Discord channel of the interaction. (CAN lead to high memory usage, as files are temporarily stored in memory) |
| `/schematic upload` | This uploads a file from the interaction to the WorldEdit directory of the Pterodactyl server. (CAN lead to high memory usage, as files are temporarily stored in memory)
| `/schematic list` | This lists all the files in the WorldEdit directory and outputs them to the interaction Discord channel in paginated messages.

## Setup
These functions were written for use with the Azure Functions environment but might work (not tested yet) with other serverless function environments.

 1. Create a v4 function-app and deploy the lastest release's files to the function app.
 2. Create a Discord application and direct your interaction handler URL to the function app's `interaction` endpoint.
 3. Create a Pterodactyl API key.
 4. Set up the environment variables in the Azure Portal.

## ToDo

 - [ ] Allow for multiple servers to be added and selectable via AutoComplete
 - [ ] Improve on memory usage, if possible
 - [ ] Test with other serverless solutions
