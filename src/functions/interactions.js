const { app, HttpResponse } = require('@azure/functions');
const { InteractionType, InteractionResponseType } = require('discord-interactions');
const nacl = require("tweetnacl");
const axios = require("axios");
const FormData = require("form-data");
const { uniqueNamesGenerator, adjectives, colors, animals, names } = require('unique-names-generator');

/*
 * Splits an array of strings into chunks based on a given size.
 *
 * @param {string[]} dat - The array of strings to be chunked.
 * @param {number} size - The maximum size of each chunk.
 * @returns {string[]} - An array of chunks.
 */
function chunkify(dat, size) {
    var chunks = [];
    dat.reduce((chuckStr, word, i, a) => {
        var pageIndex = `--- Page ${(chunks.length + 1)} --- \n \n`;
        if ((chuckStr.length + word.length + pageIndex.length) > size) {
            chunks.push(pageIndex + chuckStr);
            chuckStr = word;
        } else if (i === a.length - 1) {
            chunks.push(pageIndex + chuckStr + '\n' + word);
        } else {
            chuckStr += '\n' + word;
        }
        return chuckStr;
    }, '');
    return chunks;
}

//initialize http endpoint for interactions
app.http('interactions', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.info(["INTERACTION"]);

        //body functions can only be called once, so we need to store the raw body in a variable
        const rawBody = await request.text();
        //convert the raw body to a JSON object or an empty string
        const body = await JSON.parse(rawBody) || "";

        //get the signature and timestamp from the headers
        const signature = request.headers.get("X-Signature-Ed25519") || "";
        const timestamp = request.headers.get("X-Signature-Timestamp") || "";


        //check if the signature and timestamp are not empty and have the correct length
        if (!signature || !timestamp || signature.length < 64 || timestamp.length < 10) {
            context.debug(["INTERACTION", "MISSING_SIGNATURE_OR_TIMESTAMP"]);
            return new HttpResponse({ status: 401 });
        }

        //verify the signature
        const isVerified = nacl.sign.detached.verify(
            Buffer.from(timestamp + rawBody),
            Buffer.from(signature, "hex"),
            Buffer.from(process.env.PublicKey, "hex")
        );
        if (!isVerified) {
            context.debug(["INTERACTION", "UNVERIFIED"]);
            return new HttpResponse({ status: 401 });
        }

        //initiate axios instances for discord and pterodactyl, save resources by doing this after the verification
        const discord = axios.create({
            baseURL: "https://discord.com/api/v10",
            headers: {
                authorization: `Bot ${process.env.Token}`
            }
        });


        //check if the request is a ping or an application command
        switch (body["type"]) {
            //acknowledge the ping
            case (InteractionType.PING):
                context.debug(["INTERACTION-TYPE", "PING"]);

                //register application commands here
                //did this to avoid rate limiting when the function is cold started
                await discord.post(`/applications/${process.env.ApplicationID}/commands`, {
                    "name": "schematic",
                    "description": "Download/Upload/List schematics on the server",
                    "options": [
                        {
                            "type": 1,
                            "name": "upload",
                            "description": "Upload schematics onto the server (will be assigned a random name)",
                            "options": [
                                {
                                    "type": 11,
                                    "name": "file",
                                    "description": "The schematic file to upload",
                                    "required": true
                                }
                            ]
                        },
                        {
                            "type": 1,
                            "name": "list",
                            "description": "List schematics on the server",
                            "options": []
                        },
                        {
                            "type": 1,
                            "name": "download",
                            "description": "Download a schematic on the server",
                            "options": [
                                {
                                    "type": 3,
                                    "name": "name",
                                    "description": "Name of the schematic (excluding file ending)",
                                    "required": true
                                }
                            ]
                        }
                    ]
                }).then(() => {
                    context.info(["INTERACTION", "COMMAND_REGISTERED"]);
                }).catch((err) => {
                    context.error(["INTERACTION", "COMMAND_REGISTER_FAILED", err]);
                });

                //return a pong response
                return {
                    jsonBody: {
                        type: InteractionResponseType.PONG
                    }
                };
            case (InteractionType.APPLICATION_COMMAND):
                context.debug(["INTERACTION-TYPE", "APPLICATION_COMMAND"]);

                switch (body.data["name"]) {
                    /*
                    case "ping":
                        //generic ping command, can be used to test if the bot is online, has to be added manually to the discord application
                        return {
                            jsonBody: {
                                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                                data: {
                                    content: 'hello world',
                                },
                            }
                        }
                    break;
                    */

                    case "schematic":
                        context.debug(["INTERACTION", "SCHEMATIC_COMMAND"]);

                        //initiate axios instance for pterodactyl, save resources by doing this only if we need a pterodactyl request
                        const pterodactyl = axios.create({
                            baseURL: process.env.PterodactylURL,
                            headers: {
                                Authorization: `Bearer ${process.env.PterodactylToken}`
                            }
                        });

                        switch (body.data.options[0].name) {
                            //subcommands for the schematic command

                            //download a schematic file from the server
                            case 'download':
                                context.debug(["INTERACTION", "SCHEMATIC_DOWNLOAD"]);

                                try {
                                    context.debug(["INTERACTION", "SCHEMATIC_DOWNLOAD_START"]);

                                    //get the download link for the schematic file
                                    const { data } = await pterodactyl.get(`/api/client/servers/${process.env.ServerID}/files/download`, {
                                        params: {
                                            //get the name of the schematic file from the command
                                            file: `/plugins/WorldEdit/schematics/${body.data.options[0].options[0].value}.schematic`
                                        }
                                    });

                                    //download the file, can't supply the one-time link due to discord pre-emptively fetching the file
                                    const { data: file } = await axios.get(data.attributes.url, { responseType: 'arraybuffer' });

                                    //initiate a formdata object and append the file to it
                                    const form = new FormData();
                                    form.append("file", file, {
                                        filename: `${body.data.options[0].options[0].value}.schematic`,
                                        name: "files[0]"
                                    });

                                    //send the file to the discord channel
                                    await discord.post(`/channels/${body.channel_id}/messages`, form);

                                    context.info(["INTERACTION", "SCHEMATIC_DOWNLOAD_SUCCESS"]);

                                    //return a response to the user, confirming the download
                                    return {
                                        jsonBody: {
                                            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                                            data: {
                                                //send a message to the user, confirming the download, get the file name from the command
                                                content: `Downloaded the schematic file: \`${body.data.options[0].options[0].value}.schematic\``
                                            },
                                        }
                                    }

                                } catch (err) {
                                    //this error is most likely caused by the file not existing
                                    context.error(["INTERACTION", "SCHEMATIC_DOWNLOAD_FAILED", err]);

                                    return {
                                        jsonBody: {
                                            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                                            data: {
                                                content: 'Failed to download the schematic file.',
                                            },
                                        },
                                    };
                                }
                                break;

                            //upload a schematic file to the server
                            case "upload":
                                context.debug(["INTERACTION", "SCHEMATIC_UPLOAD"]);

                                //get the file URL from the command, uploaded as an attachment
                                const fileURL = body.data.resolved.attachments[body.data.options[0].options[0].value].url;
                                //get the file extension from the file name
                                const fileExtension = fileURL.split('.').pop();

                                //check if the file extension is not a schematic file
                                if (fileExtension !== "schematic") {
                                    context.error(["INTERACTION", "SCHEMATIC_UPLOAD_FAILED", "INVALID_FILE_EXTENSION"]);

                                    return {
                                        jsonBody: {
                                            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                                            data: {
                                                content: 'Invalid file extension. Please upload a schematic file.',
                                            },
                                        },
                                    };
                                }


                                context.debug(["INTERACTION", "SCHEMATIC_UPLOAD_START"]);

                                //download the file from the URL
                                const fileData = await axios.get(fileURL, { responseType: 'arraybuffer' });
                                //convert the file data to a buffer
                                const buffer = Buffer.from(fileData.data, 'binary');

                                //generate a random name for the file
                                const newfilename = uniqueNamesGenerator({ dictionaries: [adjectives, colors, animals, names], separator: "", style: 'capital', length: 3 });

                                //wrap the upload in a try-catch block to catch any errors, such as the file-upload failing
                                try {
                                    //upload the file to the server
                                    await pterodactyl.post(`/api/client/servers/${process.env.ServerID}/files/write`, buffer, {
                                        params: {
                                            file: `/plugins/WorldEdit/schematics/${newfilename}.schematic`
                                        }
                                    });

                                    context.info(["INTERACTION", "SCHEMATIC_UPLOAD_SUCCESS", newfilename]);

                                    //return a response to the user, confirming the upload
                                    return {
                                        jsonBody: {
                                            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                                            data: {
                                                content: `Uploaded the schematic file: \`${newfilename}.schematic\``
                                            },
                                        }
                                    }
                                }
                                catch (err) {
                                    context.error(["INTERACTION", "SCHEMATIC_UPLOAD_FAILED", err]);

                                    return {
                                        jsonBody: {
                                            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                                            data: {
                                                content: 'Failed to upload the schematic file.',
                                            },
                                        },
                                    };
                                }

                                break;

                            //list all schematic files on the server
                            case "list":
                                context.debug(["INTERACTION", "SCHEMATIC_LIST"]);
                                try {
                                    context.debug(["INTERACTION", "SCHEMATIC_LIST_START"]);
                                    //get the list of files in the schematic directory
                                    const { data } = await pterodactyl.get(`/api/client/servers/${process.env.ServerID}/files/list`, {
                                        params: {
                                            directory: "/plugins/WorldEdit/schematics"
                                        }
                                    });

                                    context.debug(["INTERACTION", "SCHEMATIC_LIST_SUCCESS"]);

                                    //get the file names from the data and remove the file extension
                                    const files = data.data.filter(a => a.endsWith(".schematic")).map((file) => file.attributes.name.replace(".schematic", ""));
                                    //split the files into chunks of up to 1950 characters
                                    const chunks = chunkify(files, 1950);

                                    //send each chunk as a separate message to the discord channel
                                    for (const chunk of chunks) {
                                        await discord.post(`/channels/${body.channel_id}/messages`, {
                                            content: "```" + chunk + "```"
                                        });
                                    }

                                    return {
                                        jsonBody: {
                                            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                                            data: {
                                                content: `Schematics on the server:`
                                            },
                                        }
                                    }
                                } catch (err) {
                                    //this error is most likely caused by the directory not existing
                                    context.error(["INTERACTION", "SCHEMATIC_LIST_FAILED", err]);

                                    return {
                                        jsonBody: {
                                            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                                            data: {
                                                content: 'Failed to list the schematic files.',
                                            },
                                        },
                                    };
                                }
                                break;

                            //command could not be found
                            default:
                                return {
                                    jsonBody: {
                                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                                        data: {
                                            content: 'Command not found',
                                        },
                                    }
                                }
                        }
                        break;

                    //command group could not be found
                    default:
                        return {
                            jsonBody: {
                                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                                data: {
                                    content: 'CommandGroup not found',
                                },
                            }
                        }
                        break;
                }
                break;

            default:
                //unknown interaction type
                context.warn(["INTERACTION", "UNKNOWN_TYPE"]);
                return new HttpResponse({ status: 400 });
        }
    }
});
