import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { csvParse } from 'd3-dsv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

const csvFilePath = path.join(__dirname, 'public', 'data', 'd_ledgers.csv');
let df;
try {
    const csvData = fs.readFileSync(csvFilePath, 'utf8');
    df = csvParse(csvData);
} catch (error) {
    console.error('Error reading CSV file:', error);
}

app.use(express.static(path.join(__dirname, 'public')));

function saveFlowDataToJSON(flowData) {
    const jsonFilePath = path.join(__dirname, 'public', 'data', 'flow_data.json');
    try {
        fs.writeFileSync(jsonFilePath, JSON.stringify(flowData, null, 2));
        console.log('Flow data saved to JSON file.');
    } catch (error) {
        console.error('Error writing to JSON file:', error);
    }
}

// Function to perform interquarter transactions.
function getNextQuarter(currentQuarter) {
    const [year, q] = currentQuarter.split('Q');
    const quarter = parseInt(q);
    const nextQuarter = (quarter % 4) + 1;
    const nextYear = nextQuarter === 1 ? parseInt(year) + 1 : parseInt(year);
    return `${nextYear}Q${nextQuarter}`;
}

// Function to calculate quarters. Helps set positions for nodes.
function countUniqueQuarters(dataFrame) {
    const uniqueQuarters = new Set();
    dataFrame.forEach(row => {
        uniqueQuarters.add(row.Quarter);
    });
    return uniqueQuarters.size;
}

// Main function to create Sankey data.
function createSankeyData(df, bigPicture = false, quarter = null, walletFilter, categoryMode = false) {

    // Special Wallet = Payment Account
    const specialWallets = {
        'Ecosystem': 0.9,
        'Public Goods': 0.9,
        'Metagov': 0.9,
        'Community WG': 0.9,
        'Service Providers': 0.9
    };
    const colorMap = {
        'USDC': 'rgba(39, 117, 202, 0.8)',
        'ETH': 'rgba(185, 124, 243, 0.8)',
        'ENS': 'rgba(90, 200, 250, 0.8)'
    };
    let flowData = {};

    let nodes = [];
    let nodeIndices = {};
    let linkSources = [];
    let linkTargets = [];
    let linkValues = [];
    let linkColors = [];
    let linkLabels = [];
    let nodeCustomdata = [];
    let nodeColors = [];
    let nodeX = [];
    let nodeY = [];

    // Variables for dividing into quarters in Big Picture mode
    let quarterCount = countUniqueQuarters(df);
    let border = 0.01;
    let quarterNumber = (1 - border) / quarterCount;

    // Variables for positioning nodes

    // In big picture:
    let startPoint = 0;

    // For detailed
    let daoWalletZone = 0.005;
    let daoWalletZoneRecipients = 0;

    let ecosystemZone = 0.02;
    let ecosystemZoneRecipients, ecosystemZoneSenders = ecosystemZone;

    let publicGoodsZone = 0.1;
    let publicGoodsZoneRecipients, publicGoodsZoneSenders = publicGoodsZone;

    let metagovZone = 0.182;
    let metagovZoneRecipient, metagoveZoneSenders = metagovZone;

    let communityWGZone = 0.2;
    let communityWGZoneRecipients, communityWGZoneSenders = communityWGZone;

    let spsZone = 0.225;
    let spsZoneRecipients, spsZoneSenders = spsZone;

    // For catergory mode
    let daoWalletZoneCat = 0.05;
    let daoWalletZoneRecipientsCat = 0;

    let ecosystemZoneCat = 0.135;
    let ecosystemZoneRecipientsCat, ecosystemZoneSendersCat = ecosystemZoneCat;

    let publicGoodsZoneCat = 0.215;
    let publicGoodsZoneRecipientsCat, publicGoodsZoneSendersCat = publicGoodsZoneCat;

    let metagovZoneCat = 0.27;
    let metagovZoneRecipientCat, metagoveZoneSendersCat = metagovZoneCat;

    let communityWGZoneCat = 0.32;
    let communityWGZoneRecipientsCat = communityWGZoneCat;

    let spsZoneCat = 0.32;
    let spsZoneRecipientsCat, spsZoneSendersCat = spsZoneCat;

    // In quarterly display:
    let daoWalletY = 0.05;
    let daoWalletX = 0.05;
    let lastDaoWalletY = daoWalletY;

    let lastX = 0.97;
    let specialWalletsX = 0.3;
    let daoWalletRecipients = [];

    let lastEcosystemY = 0;
    let ecosystemRecipients = [];
    let ecosystemSenders = [];
    let lastEcosystemSenderY = daoWalletY + 0.2;

    let lastPublicGoodsY = 0;
    let publicGoodsRecipients = [];
    let publicGoodsSenders = [];
    let lastPublicGoodsSenderY = lastEcosystemSenderY + 0.2;

    let lastMetagovY = 0;
    let metagovRecipients = [];
    let metagovSenders = [];
    let lastMetagovSenderY = lastPublicGoodsSenderY + 0.2; 

    let lastCommunityWGY = 0;
    let communityWGRecipients = [];
    let communityWGSenders = [];
    let lastCommunityWGSenderY = lastMetagovSenderY + 0.2;

    let lastSpsY = 0;
    let spsRecipients = [];
    let spsSenders = [];
    let lastSpsSenderY = lastMetagovSenderY + 0.2;

    // Flags
    let interCatFlag = false;
    let senderFlag = false;
    
    // Conditions for different models
    let condition1 = false;
    let condition2 = false;
    let condition3 = false;

    // Auxiliary Variables
    let daoWalletRecipientsSet = new Set();
    let specialWalletSenders = new Set();
    let specialWalletTransactions = [];
    let dummyNodeXY = -10000;

    // Condition checker
    df.forEach(row => {
        if (quarter !== 'big_picture' && row['Transaction Hash'] === 'Interquarter') {
            return;
        }

        const sender = categoryMode ? row.From_category : row.From_name;
        const receiver = categoryMode ? row.To_category : row.To_name;
        const qtr = row.Quarter;

        if (!flowData[qtr]) {
            flowData[qtr] = [];
        }

        if (sender === 'DAO Wallet') {
            if (!specialWallets.hasOwnProperty(receiver)) {
                if (walletFilter) {
                    condition1 = false;
                } else {
                    condition1 = true;
                } daoWalletRecipientsSet.add(receiver);
            } else {
                if (walletFilter) {
                    condition1 = false;
                } else {
                    condition2 = true;
                } daoWalletRecipientsSet.add(receiver);
            }
        }

        if (specialWallets.hasOwnProperty(receiver) && sender !== 'DAO Wallet') {
            specialWalletSenders.add(sender);
            specialWalletTransactions.push({ sender, receiver });
        }
    });


    specialWalletTransactions.forEach(({ sender, receiver }) => {
        if (specialWallets.hasOwnProperty(sender) && specialWallets.hasOwnProperty(receiver)) {
            condition3 = false;
        } else if (specialWallets.hasOwnProperty(sender) && specialWallets.hasOwnProperty(receiver)) {
            condition3 = false;
        } else {
            condition3 = true;
        }
    });

    // Model assigner
    let model;
    if (condition1 && condition2 && !condition3) {
        model = 1;
    } else if (condition1 && !condition2 && !condition3) {
        model = 2;
    } else if (condition2 && condition3 && !condition1) {
        model = 3;
    } else if (condition1 && condition3 && !condition2) {
        model = 4;
    } else if (condition1 && condition2 && condition3) {
        model = (quarter === '2022Q3') ? 'dissolution' : 5;
    } else if (walletFilter) {
        model = 'detailed';
    } else {
        model = 'NaN';
    }

    // Assigning positions to nodes;
    // The assignment is based on the enabled display modes, models, and node names;
    // These complex structures can and should be simplified in the future;
    // But at the moment they are quite detailed so that I can remain flexible.
    const getNodeIndex = (nodeName, sender, receiver, model, quarter = null) => {

        if (bigPicture) {
            if (!nodeIndices[nodeName]) {
                nodeIndices[nodeName] = nodes.length;
                nodes.push(nodeName);
                const account = df.find(d => d.From_name === nodeName);
                nodeCustomdata.push(`Account: ${account ? account.From : 'N/A'}`);
                nodeColors.push('rgba(0, 0, 0, 0)');

                if (!categoryMode) {
                    if (nodeName.includes('2022Q1')) {
                        startPoint = quarterNumber*0 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipients += 0.004;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipients += 0.004);
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0025);
                            publicGoodsZoneRecipients = publicGoodsZone;
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0025);
                            metagovZoneRecipient = metagovZone;
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(metagovZoneRecipient += 0.0025);
                        } else if (nodeName.startsWith('Community WG')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(communityWGZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Community WG')) {
                            if (interCatFlag) {
                                communityWGZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(communityWGZoneRecipients += 0.0025);
                        }

                    } else if (nodeName.includes('2022Q2')) {
                        startPoint = quarterNumber*1 - quarterNumber + border
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipients += 0.004;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipients += 0.004);
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0025);
                            publicGoodsZoneRecipients = publicGoodsZone;
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0025);
                            metagovZoneRecipient = metagovZone;
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(metagovZoneRecipient += 0.0025);
                            communityWGZoneRecipients = communityWGZone;
                        } else if (nodeName.startsWith('Community WG')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(communityWGZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Community WG')) {
                            if (interCatFlag) {
                                communityWGZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(communityWGZoneRecipients += 0.0025);
                        }

                    } else if (nodeName.includes('2022Q3')) {
                        startPoint = quarterNumber*2 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipients += 0.004;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipients += 0.004);
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0025);
                            publicGoodsZoneRecipients = publicGoodsZone;
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0025);
                            metagovZoneRecipient = metagovZone;
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(metagovZoneRecipient += 0.0025);
                        } else if (nodeName.startsWith('Community WG')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(communityWGZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Community WG')) {
                            if (interCatFlag) {
                                communityWGZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(communityWGZoneRecipients += 0.0025);
                        }

                    } else if (nodeName.includes('2022Q4')) {
                    startPoint = quarterNumber*3 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipients += 0.004;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipients += 0.004);
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0025);
                            publicGoodsZoneRecipients = publicGoodsZone;
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0025);
                            metagovZoneRecipient = metagovZone;
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(metagovZoneRecipient += 0.0025);
                        } else if (nodeName.startsWith('Community WG')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(communityWGZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Community WG')) {
                            if (interCatFlag) {
                                communityWGZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(communityWGZoneRecipients += 0.0025);
                        }

                    } else if (nodeName.includes('2023Q1')) {
                        startPoint = quarterNumber*4 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipients += 0.004;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipients += 0.004);
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                            ecosystemZoneSenders = ecosystemZone + 0.001;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0025);
                            publicGoodsZoneRecipients = publicGoodsZone;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(ecosystemZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0025);
                            metagovZoneRecipient = metagovZone;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(metagovZoneRecipient += 0.0025);
                        } else if (receiver.startsWith('Metagov')) {
                        nodeX.push(startPoint);
                        nodeY.push(metagoveZoneSenders -= 0.0075)
                        }

                    } else if (nodeName.includes('2023Q2')) {
                        startPoint = quarterNumber*5 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipients += 0.004;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipients += 0.004);
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                            ecosystemZoneSenders = ecosystemZone + 0.005;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0025);
                            publicGoodsZoneRecipients = publicGoodsZone;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0025);
                            metagovZoneRecipient = metagovZone;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(metagovZoneRecipient += 0.0025);
                        } else if (receiver.startsWith('Metagov')) {
                        nodeX.push(startPoint);
                        nodeY.push(metagoveZoneSenders -= 0.0075)
                        }

                    } else if (nodeName.includes('2023Q3')) {
                        startPoint = quarterNumber*6 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipients += 0.004;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipients += 0.004);
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                            ecosystemZoneSenders = ecosystemZone + 0.005;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0025);
                            publicGoodsZoneRecipients = publicGoodsZone;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0025);
                            metagovZoneRecipient = metagovZone;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(metagovZoneRecipient += 0.0025);
                        } else if (receiver.startsWith('Metagov')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(metagoveZoneSenders -= 0.002)
                        }

                    } else if (nodeName.includes('2023Q4')) {
                        startPoint = quarterNumber*7 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipients += 0.004;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipients += 0.004);
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                            ecosystemZoneSenders = ecosystemZone + 0.005;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0025);
                            publicGoodsZoneRecipients = publicGoodsZone;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(ecosystemZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0025);
                            metagovZoneRecipient = metagovZone;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(metagovZoneRecipient += 0.0025);
                        } else if (receiver.startsWith('Metagov')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(metagoveZoneSenders -= 0.002)
                        }

                    } else if (nodeName.includes('2024Q1')) {
                        startPoint = quarterNumber*8 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipients += 0.004;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipients += 0.004);
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                            ecosystemZoneSenders = ecosystemZone + 0.001;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0025);
                            publicGoodsZoneRecipients = publicGoodsZone;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0025);
                            metagovZoneRecipient = metagovZone;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(metagovZoneRecipient += 0.0025);
                            spsZoneRecipients = spsZone;
                        } else if (receiver.startsWith('Metagov')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(metagoveZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Service Providers')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(spsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Service Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(spsZoneRecipients += 0.0025);
                        } else if (receiver.startsWith('Service Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSenders -= 0.002)
                        }

                    } else if (nodeName.includes('2024Q2')) {
                        startPoint = quarterNumber*9 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipients += 0.002;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipients += 0.002);
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0025);
                            publicGoodsZoneRecipients = publicGoodsZone;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0025);
                            metagovZoneRecipient = metagovZone;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(metagovZoneRecipient += 0.0025);
                            spsZoneRecipients = spsZone;
                        } else if (receiver.startsWith('Metagov')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(metagoveZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Service Providers')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(spsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Service Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(spsZoneRecipients += 0.0025);
                        } else if (receiver.startsWith('Service Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSenders -= 0.0075)
                        }

                    } else if (nodeName.includes('2024Q3')) {
                        startPoint = quarterNumber*11 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipients += 0.002;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipients += 0.002);
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0025);
                            publicGoodsZoneRecipients = publicGoodsZone;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0025);
                            metagovZoneRecipient = metagovZone;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(metagovZoneRecipient += 0.0025);
                            spsZoneRecipients = spsZone;
                        } else if (receiver.startsWith('Metagov')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(metagoveZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Service Providers')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(spsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Service Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(spsZoneRecipients += 0.0025);
                        } else if (receiver.startsWith('Service Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSenders -= 0.0075)
                        }
                        
                    } else if (nodeName.includes('2024Q4')) {
                        startPoint = quarterNumber*12 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipients += 0.002;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipients += 0.002);
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0025);
                            publicGoodsZoneRecipients = publicGoodsZone;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0025);
                            metagovZoneRecipient = metagovZone;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(metagovZoneRecipient += 0.0025);
                            spsZoneRecipients = spsZone;
                        } else if (receiver.startsWith('Metagov')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(metagoveZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Service Providers')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(spsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Service Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(spsZoneRecipients += 0.0025);
                        } else if (receiver.startsWith('Service Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSenders -= 0.0075)
                        }
                    } else if (nodeName.includes('2025Q1')) {
                        startPoint = quarterNumber*13 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipients += 0.002;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipients += 0.002);
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0025);
                            publicGoodsZoneRecipients = publicGoodsZone;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0025);
                            metagovZoneRecipient = metagovZone;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(metagovZoneRecipient += 0.0025);
                            spsZoneRecipients = spsZone;
                        } else if (receiver.startsWith('Metagov')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(metagoveZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Service Providers')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(spsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Service Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(spsZoneRecipients += 0.0025);
                        } else if (receiver.startsWith('Service Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSenders -= 0.0075)
                        }
                    } else if (nodeName.includes('2025Q2')) {
                        startPoint = quarterNumber*14 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipients += 0.002;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipients += 0.002);
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0025);
                            publicGoodsZoneRecipients = publicGoodsZone;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0025);
                            metagovZoneRecipient = metagovZone;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(metagovZoneRecipient += 0.0025);
                            spsZoneRecipients = spsZone;
                        } else if (receiver.startsWith('Metagov')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(metagoveZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Service Providers')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(spsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Service Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(spsZoneRecipients += 0.0025);
                        } else if (receiver.startsWith('Service Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSenders -= 0.0075)
                        }
                    } else if (nodeName.includes('2025Q3')) {
                        startPoint = quarterNumber*15 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZone);
                            interCatFlag = true;
                            daoWalletZoneRecipients = daoWalletZone;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipients += 0.002;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipients += 0.002);
                            ecosystemZoneRecipients = ecosystemZone;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));
                            nodeY.push(ecosystemZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(ecosystemZoneRecipients += 0.0025);
                            publicGoodsZoneRecipients = publicGoodsZone;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(publicGoodsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(publicGoodsZoneRecipients += 0.0025);
                            metagovZoneRecipient = metagovZone;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(metagovZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipient += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(metagovZoneRecipient += 0.0025);
                            spsZoneRecipients = spsZone;
                        } else if (receiver.startsWith('Metagov')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(metagoveZoneSenders -= 0.002)
                        } else if (nodeName.startsWith('Service Providers')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(spsZone);
                            interCatFlag = true;
                        } else if (sender.startsWith('Service Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipients += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(spsZoneRecipients += 0.0025);
                        } else if (receiver.startsWith('Service Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSenders -= 0.0075)
                        }
                    } else if (sender === 'Plchld') {
                        nodeX.push(dummyNodeXY);
                        nodeY.push(dummyNodeXY);
                    }
                } else if (categoryMode) {
                    if (nodeName.includes('2022Q1')) {
                        startPoint = quarterNumber*0 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipientsCat += 0.035;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(daoWalletZoneRecipientsCat += 0.015);
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(ecosystemZoneRecipientsCat += 0.005);
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(publicGoodsZoneRecipientsCat += 0.005);
                            metagovZoneRecipientCat = metagovZoneCat;
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(metagovZoneRecipientCat += 0.005);
                            communityWGZoneRecipientsCat = communityWGZoneCat;
                        } else if (nodeName.startsWith('Community WG')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(communityWGZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Community WG')) {
                            if (interCatFlag) {
                                communityWGZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(communityWGZoneRecipientsCat += 0.005);
                        }
                    
                    } else if (nodeName.includes('2022Q2')) {
                        startPoint = quarterNumber*1 - quarterNumber + border
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipientsCat += 0.035;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(daoWalletZoneRecipientsCat += 0.015);
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(ecosystemZoneRecipientsCat += 0.005);
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(publicGoodsZoneRecipientsCat += 0.005);
                            metagovZoneRecipientCat = metagovZoneCat;
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(metagovZoneRecipientCat += 0.005);
                        } else if (nodeName.startsWith('Community WG')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(communityWGZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Community WG')) {
                            if (interCatFlag) {
                                communityWGZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(communityWGZoneRecipientsCat += 0.005);
                        }
                    
                    } else if (nodeName.includes('2022Q3')) {
                        startPoint = quarterNumber*2 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipientsCat += 0.035;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(daoWalletZoneRecipientsCat += 0.015);
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(ecosystemZoneRecipientsCat += 0.005);
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(publicGoodsZoneRecipientsCat += 0.005);
                            metagovZoneRecipientCat = metagovZoneCat;
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(metagovZoneRecipientCat += 0.005);
                        } else if (nodeName.startsWith('Community WG')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(communityWGZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Community WG')) {
                            if (interCatFlag) {
                                communityWGZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(communityWGZoneRecipientsCat += 0.005);
                        }
                    
                    } else if (nodeName.includes('2022Q4')) {
                    startPoint = quarterNumber*3 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipientsCat += 0.035;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(daoWalletZoneRecipientsCat += 0.015);
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(ecosystemZoneRecipientsCat += 0.005);
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(publicGoodsZoneRecipientsCat += 0.005);
                            metagovZoneRecipientCat = metagovZoneCat;
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(metagovZoneRecipientCat += 0.005);
                        } else if (nodeName.startsWith('Community WG')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(communityWGZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Community WG')) {
                            if (interCatFlag) {
                                communityWGZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(communityWGZoneRecipientsCat += 0.005);
                        }
                    
                    } else if (nodeName.includes('2023Q1')) {
                        startPoint = quarterNumber*4 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipientsCat += 0.035;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(daoWalletZoneRecipientsCat += 0.015);
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                            ecosystemZoneSendersCat = ecosystemZoneCat + 0.001;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(ecosystemZoneRecipientsCat += 0.005);
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSendersCat += 0.004)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(publicGoodsZoneRecipientsCat += 0.005);
                            metagovZoneRecipientCat = metagovZoneCat;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSendersCat -= 0.005)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(metagovZoneRecipientCat += 0.005);
                        } else if (receiver.startsWith('Metagov')) {
                        nodeX.push(startPoint);
                        nodeY.push(metagoveZoneSendersCat -= 0.005)
                        }
                    
                    } else if (nodeName.includes('2023Q2')) {
                        startPoint = quarterNumber*5 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipientsCat += 0.035;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(daoWalletZoneRecipientsCat += 0.015);
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                            ecosystemZoneSendersCat = ecosystemZoneCat + 0.005;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(ecosystemZoneRecipientsCat += 0.005);
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSendersCat += 0.004)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(publicGoodsZoneRecipientsCat += 0.005);
                            metagovZoneRecipientCat = metagovZoneCat;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSendersCat -= 0.005)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(metagovZoneRecipientCat += 0.005);
                        } else if (receiver.startsWith('Metagov')) {
                        nodeX.push(startPoint);
                        nodeY.push(metagoveZoneSendersCat -= 0.005)
                        }
                    
                    } else if (nodeName.includes('2023Q3')) {
                        startPoint = quarterNumber*6 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipientsCat += 0.035;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(daoWalletZoneRecipientsCat += 0.015);
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                            ecosystemZoneSendersCat = ecosystemZoneCat + 0.005;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(ecosystemZoneRecipientsCat += 0.005);
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSendersCat += 0.004)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(publicGoodsZoneRecipientsCat += 0.005);
                            metagovZoneRecipientCat = metagovZoneCat;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSendersCat -= 0.005)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(metagovZoneRecipientCat += 0.005);
                        } else if (receiver.startsWith('Metagov')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(metagoveZoneSendersCat += 0.004)
                        }
                    
                    } else if (nodeName.includes('2023Q4')) {
                        startPoint = quarterNumber*7 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipientsCat += 0.035;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(daoWalletZoneRecipientsCat += 0.015);
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                            ecosystemZoneSendersCat = ecosystemZoneCat + 0.005;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(ecosystemZoneRecipientsCat += 0.005);
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSendersCat += 0.004)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(publicGoodsZoneRecipientsCat += 0.005);
                            metagovZoneRecipientCat = metagovZoneCat;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSendersCat -= 0.005)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(metagovZoneRecipientCat += 0.005);
                        } else if (receiver.startsWith('Metagov')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(metagoveZoneSendersCat += 0.004)
                        }
                    
                    } else if (nodeName.includes('2024Q1')) {
                        startPoint = quarterNumber*8 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipientsCat += 0.035;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(daoWalletZoneRecipientsCat += 0.015);
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                            ecosystemZoneSendersCat = ecosystemZoneCat + 0.001;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(ecosystemZoneRecipientsCat += 0.005);
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSendersCat += 0.004)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(publicGoodsZoneRecipientsCat += 0.005);
                            metagovZoneRecipientCat = metagovZoneCat;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSendersCat -= 0.005)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(metagovZoneRecipientCat += 0.005);
                            spsZoneRecipientsCat = spsZoneCat;
                        } else if (receiver.startsWith('Metagov')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(metagoveZoneSendersCat += 0.004)
                        } else if (nodeName.startsWith('Service Providers')) {
                            nodeX.push(startPoint + (quarterNumber/2.5));;
                            nodeY.push(spsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Service Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(spsZoneRecipientsCat += 0.005);
                        } else if (receiver.startsWith('Service Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSendersCat -= 0.0075)
                        }
                    
                    } else if (nodeName.includes('2024Q2')) {
                        startPoint = quarterNumber*9 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipientsCat += 0.035;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  6*border);
                            nodeY.push(daoWalletZoneRecipientsCat += 0.015);
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/8));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                            ecosystemZoneSendersCat = ecosystemZoneCat + 0.001;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  7*border);
                            nodeY.push(ecosystemZoneRecipientsCat += 0.005);
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSendersCat += 0.004)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/8));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  7*border);
                            nodeY.push(publicGoodsZoneRecipientsCat += 0.005);
                            metagovZoneRecipientCat = metagovZoneCat;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSendersCat -= 0.005)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/8));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  7*border);
                            nodeY.push(metagovZoneRecipientCat += 0.005);
                            spsZoneRecipientsCat = spsZoneCat;
                        } else if (receiver.startsWith('Metagov')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(metagoveZoneSendersCat += 0.004)
                        } else if (nodeName.startsWith('Service Providers')) {
                            nodeX.push(startPoint + (quarterNumber/8));;
                            nodeY.push(spsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Service Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  7*border);
                            nodeY.push(spsZoneRecipientsCat += 0.005);
                        } else if (receiver.startsWith('Service Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSendersCat -= 0.0075)
                        }
                    
                    } else if (nodeName.includes('2024Q3')) {
                        startPoint = quarterNumber*11 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipientsCat += 0.002;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipientsCat += 0.002);
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(ecosystemZoneRecipientsCat += 0.005);
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSendersCat += 0.004)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  7*border);
                            nodeY.push(publicGoodsZoneRecipientsCat += 0.005);
                            metagovZoneRecipientCat = metagovZoneCat;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSendersCat -= 0.005)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(metagovZoneRecipientCat += 0.005);
                            spsZoneRecipientsCat = spsZoneCat;
                        } else if (receiver.startsWith('Metagov')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(metagoveZoneSendersCat += 0.004)
                        } else if (nodeName.startsWith('Service Providers')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(spsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Service Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(spsZoneRecipientsCat += 0.005);
                        } else if (receiver.startsWith('Service Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSendersCat -= 0.0075)
                        }
                        
                    } else if (nodeName.includes('2024Q4')) {
                        startPoint = quarterNumber*12 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipientsCat += 0.002;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipientsCat += 0.002);
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(ecosystemZoneRecipientsCat += 0.005);
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSendersCat += 0.004)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(publicGoodsZoneRecipientsCat += 0.005);
                            metagovZoneRecipientCat = metagovZoneCat;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSendersCat -= 0.005)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(metagovZoneRecipientCat += 0.005);
                            spsZoneRecipientsCat = spsZoneCat;
                        } else if (receiver.startsWith('Metagov')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(metagoveZoneSendersCat += 0.004)
                        } else if (nodeName.startsWith('Service Providers')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(spsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Service Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(spsZoneRecipientsCat += 0.005);
                        } else if (receiver.startsWith('Service Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSendersCat -= 0.0075)
                        }
                    } else if (nodeName.includes('2025Q1')) {
                        startPoint = quarterNumber*13 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipientsCat += 0.002;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipientsCat += 0.002);
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(ecosystemZoneRecipientsCat += 0.005);
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSendersCat += 0.004)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(publicGoodsZoneRecipientsCat += 0.005);
                            metagovZoneRecipientCat = metagovZoneCat;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSendersCat -= 0.005)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(metagovZoneRecipientCat += 0.005);
                            spsZoneRecipientsCat = spsZoneCat;
                        } else if (receiver.startsWith('Metagov')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(metagoveZoneSendersCat += 0.004)
                        } else if (nodeName.startsWith('Service Providers')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(spsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Service Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(spsZoneRecipientsCat += 0.005);
                        } else if (receiver.startsWith('Service Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSendersCat -= 0.0075)
                        }
                    } else if (nodeName.includes('2025Q2')) {
                        startPoint = quarterNumber*14 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipientsCat += 0.002;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipientsCat += 0.002);
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(ecosystemZoneRecipientsCat += 0.005);
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSendersCat += 0.004)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(publicGoodsZoneRecipientsCat += 0.005);
                            metagovZoneRecipientCat = metagovZoneCat;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSendersCat -= 0.005)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(metagovZoneRecipientCat += 0.005);
                            spsZoneRecipientsCat = spsZoneCat;
                        } else if (receiver.startsWith('Metagov')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(metagoveZoneSendersCat += 0.004)
                        } else if (nodeName.startsWith('Service Providers')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(spsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Service Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(spsZoneRecipientsCat += 0.005);
                        } else if (receiver.startsWith('Service Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSendersCat -= 0.0075)
                        }
                    } else if (nodeName.includes('2025Q3')) {
                        startPoint = quarterNumber*15 - quarterNumber + border;
                        if (nodeName.startsWith('DAO Wallet')) {
                            nodeX.push(startPoint);
                            nodeY.push(daoWalletZoneCat);
                            interCatFlag = true;
                            daoWalletZoneRecipientsCat = daoWalletZoneCat;
                        } else if (sender.startsWith('DAO Wallet')) {
                            if (interCatFlag) {
                                daoWalletZoneRecipientsCat += 0.002;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3*border);
                            nodeY.push(daoWalletZoneRecipientsCat += 0.002);
                            ecosystemZoneRecipientsCat = ecosystemZoneCat;
                        } else if (nodeName.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));
                            nodeY.push(ecosystemZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Ecosystem')) {
                            if (interCatFlag) {
                                ecosystemZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(ecosystemZoneRecipientsCat += 0.005);
                            publicGoodsZoneRecipientsCat = publicGoodsZoneCat;
                        } else if (receiver.startsWith('Ecosystem')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(ecosystemZoneSendersCat += 0.004)
                        } else if (nodeName.startsWith('Public Goods')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(publicGoodsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Public Goods')) {
                            if (interCatFlag) {
                                publicGoodsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(publicGoodsZoneRecipientsCat += 0.005);
                            metagovZoneRecipientCat = metagovZoneCat;
                        } else if (receiver.startsWith('Public Goods')) {
                            nodeX.push(startPoint + 2.5*border);
                            nodeY.push(publicGoodsZoneSendersCat -= 0.005)
                        } else if (nodeName.startsWith('Metagov')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(metagovZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Metagov')) {
                            if (interCatFlag) {
                                metagovZoneRecipientCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  5*border);
                            nodeY.push(metagovZoneRecipientCat += 0.005);
                            spsZoneRecipientsCat = spsZoneCat;
                        } else if (receiver.startsWith('Metagov')) {
                            nodeX.push(startPoint + 3*border);
                            nodeY.push(metagoveZoneSendersCat += 0.004)
                        } else if (nodeName.startsWith('Service Providers')) {
                            nodeX.push(startPoint + (quarterNumber/3.5));;
                            nodeY.push(spsZoneCat);
                            interCatFlag = true;
                        } else if (sender.startsWith('Service Providers')) {
                            if (interCatFlag) {
                                spsZoneRecipientsCat += 0.001;
                                interCatFlag = false;
                            }
                            nodeX.push(startPoint + quarterNumber -  3.5*border);
                            nodeY.push(spsZoneRecipientsCat += 0.005);
                        } else if (receiver.startsWith('Service Providers')) {
                            nodeX.push(startPoint);
                            nodeY.push(spsZoneSendersCat -= 0.0075)
                        }
                    } else if (sender === 'Plchld') {
                        nodeX.push(dummyNodeXY);
                        nodeY.push(dummyNodeXY);
                    }
                }
            }
            return nodeIndices[nodeName];
        }
        
        if (quarter) {
            if (!nodeIndices[nodeName]) {
                nodeIndices[nodeName] = nodes.length;
                nodes.push(nodeName);
                nodeColors.push('rgba(0, 0, 0, 0)');

                if (model === 1) {
                    if (!categoryMode) {
                        if (nodeName === 'DAO Wallet') {
                            nodeX.push(daoWalletX);
                            nodeY.push(daoWalletY);
                        } else if (sender === 'DAO Wallet' && !specialWallets.hasOwnProperty(nodeName)) {
                            nodeX.push(0.95);
                            nodeY.push(lastDaoWalletY += (daoWalletRecipients.length * 0.15));
                            daoWalletRecipients.push(nodeName);
                        } else if (nodeName === 'Ecosystem') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastEcosystemY = lastDaoWalletY + 0.075);
                            interCatFlag = true;
                        } else if (sender === 'Ecosystem') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastEcosystemY += 0.02);
                            ecosystemRecipients.push(nodeName);
                        } else if (nodeName === 'Public Goods') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastPublicGoodsY = lastEcosystemY + 0.02);
                            interCatFlag = true;
                        } else if (sender === 'Public Goods') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastPublicGoodsY += 0.02);
                            publicGoodsRecipients.push(nodeName);
                        } else if (nodeName === 'Metagov') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastMetagovY = lastPublicGoodsY + 0.02);
                            interCatFlag = true;
                        } else if (sender === 'Metagov') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastMetagovY += 0.02);
                            metagovRecipients.push(nodeName);
                        } else if (nodeName === 'Community WG') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastCommunityWGY = lastMetagovY + 0.02);
                            interCatFlag = true;
                        } else if (sender === 'Community WG') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastCommunityWGY += 0.02);
                            communityWGRecipients.push(nodeName);
                        } else if (nodeName === 'Service Providers') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastSpsY = lastMetagovY + 0.02);
                            interCatFlag = true;
                        } else if (sender == 'Service Providers') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastSpsY += 0.02);
                            spsRecipients.push(nodeName);
                        } else if (nodeName === 'Plchld') {
                            nodeX.push(dummyNodeXY);
                            nodeY.push(dummyNodeXY);
                        } else if (sender === 'Plchld') {
                            nodeX.push(dummyNodeXY);
                            nodeY.push(dummyNodeXY);
                        }

                    } else if (categoryMode) {
                        if (nodeName === 'DAO Wallet') {
                            nodeX.push(daoWalletX);
                            nodeY.push(daoWalletY);
                            interCatFlag = true;
                        } else if (sender === 'DAO Wallet' && !specialWallets.hasOwnProperty(nodeName)) {
                            if (interCatFlag) {
                                lastDaoWalletY -= 0.075;
                                interCatFlag = false;
                            }
                            nodeX.push(0.95);
                            nodeY.push(lastDaoWalletY);
                            lastDaoWalletY += 0.3;
                            daoWalletRecipients.push(nodeName);
                        } else if (nodeName === 'Ecosystem') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastEcosystemY = lastDaoWalletY -= 0.05);
                            interCatFlag = true;
                        } else if (sender === 'Ecosystem') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastEcosystemY += 0.03);
                            ecosystemRecipients.push(nodeName);
                        } else if (nodeName === 'Public Goods') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastPublicGoodsY = lastEcosystemY + 0.03);
                            interCatFlag = true;
                        } else if (sender === 'Public Goods') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastPublicGoodsY += 0.03);
                            publicGoodsRecipients.push(nodeName);
                        } else if (nodeName === 'Metagov') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastMetagovY = lastPublicGoodsY + 0.03);
                            interCatFlag = true;
                        } else if (sender === 'Metagov') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastMetagovY += 0.03);
                            metagovRecipients.push(nodeName);
                        } else if (nodeName === 'Community WG') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastCommunityWGY = lastMetagovY + 0.03);
                            interCatFlag = true;
                        } else if (sender === 'Community WG') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastCommunityWGY += 0.03);
                            communityWGRecipients.push(nodeName);
                        } else if (nodeName === 'Service Providers') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastSpsY = lastMetagovY + 0.03);
                            interCatFlag = true;
                        } else if (sender == 'Service Providers') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastSpsY += 0.03);
                            spsRecipients.push(nodeName);
                        } else if (nodeName === 'Plchld') {
                            nodeX.push(dummyNodeXY);
                            nodeY.push(dummyNodeXY);
                        } else if (sender === 'Plchld') {
                            nodeX.push(dummyNodeXY);
                            nodeY.push(dummyNodeXY);
                        }
                    }

                } else if (model === 2) {
                    if (!categoryMode) {
                        if (nodeName === 'DAO Wallet') {
                            nodeX.push(daoWalletX);
                            nodeY.push(daoWalletY);
                        } else if (sender === 'DAO Wallet' && !specialWallets.hasOwnProperty(nodeName)) {
                            nodeX.push(0.95);
                            nodeY.push(daoWalletY);
                            daoWalletRecipients.push(nodeName);
                        } else if (nodeName === 'Ecosystem') {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastEcosystemY += 0.2);
                            interCatFlag = true;
                        } else if (sender === 'Ecosystem') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastEcosystemY += 0.02);
                            ecosystemRecipients.push(nodeName);
                        } else if (nodeName === 'Public Goods') {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastPublicGoodsY = lastEcosystemY + 0.02);
                            interCatFlag = true;
                        } else if (sender === 'Public Goods') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastPublicGoodsY += 0.02);
                            publicGoodsRecipients.push(nodeName);
                        } else if (nodeName === 'Metagov') {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastMetagovY = lastPublicGoodsY + 0.02);
                            interCatFlag = true;
                        } else if (sender === 'Metagov') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastMetagovY += 0.02);
                            metagovRecipients.push(nodeName);
                        } else if (nodeName === 'Community WG') {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastCommunityWGY = lastMetagovY + 0.02);
                            interCatFlag = true;
                        } else if (sender === 'Community WG') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastCommunityWGY += 0.02);
                            communityWGRecipients.push(nodeName);
                        } else if (nodeName === 'Service Providers') {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastSpsY = lastMetagovY + 0.02);
                            interCatFlag = true;
                        } else if (sender == 'Service Providers') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastSpsY += 0.02);
                            spsRecipients.push(nodeName);
                        } else if (nodeName === 'Plchld') {
                            nodeX.push(dummyNodeXY);
                            nodeY.push(dummyNodeXY);
                        } else if (sender === 'Plchld') {
                            nodeX.push(dummyNodeXY);
                            nodeY.push(dummyNodeXY);
                        }
                    } else if (categoryMode) {
                        if (nodeName === 'DAO Wallet') {
                            nodeX.push(daoWalletX);
                            nodeY.push(daoWalletY);
                        } else if (sender === 'DAO Wallet' && !specialWallets.hasOwnProperty(nodeName)) {
                            nodeX.push(0.95);
                            nodeY.push(daoWalletY);
                            daoWalletRecipients.push(nodeName);
                        } else if (nodeName === 'Ecosystem') {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastEcosystemY += daoWalletY + 0.375);
                            interCatFlag = true;
                        } else if (sender === 'Ecosystem') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastEcosystemY += 0.05);
                            ecosystemRecipients.push(nodeName);
                        } else if (nodeName === 'Public Goods') {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastPublicGoodsY = lastEcosystemY + 0.05);
                            interCatFlag = true;
                        } else if (sender === 'Public Goods') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastPublicGoodsY += 0.05);
                            publicGoodsRecipients.push(nodeName);
                        } else if (nodeName === 'Metagov') {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastMetagovY = lastPublicGoodsY + 0.05);
                            interCatFlag = true;
                        } else if (sender === 'Metagov') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastMetagovY += 0.05);
                            metagovRecipients.push(nodeName);
                        } else if (nodeName === 'Community WG') {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastCommunityWGY = lastMetagovY + 0.05);
                            interCatFlag = true;
                        } else if (sender === 'Community WG') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastCommunityWGY += 0.05);
                            communityWGRecipients.push(nodeName);
                        } else if (nodeName === 'Service Providers') {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastSpsY = lastMetagovY + 0.05);
                            interCatFlag = true;
                        } else if (sender == 'Service Providers') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastSpsY += 0.03);
                            spsRecipients.push(nodeName);
                        } else if (nodeName === 'Plchld') {
                            nodeX.push(dummyNodeXY);
                            nodeY.push(dummyNodeXY);
                        } else if (sender === 'Plchld') {
                            nodeX.push(dummyNodeXY);
                            nodeY.push(dummyNodeXY);
                        }
                    }

                } else if (model === 3) {
                    if (!categoryMode) {
                        if (nodeName === 'DAO Wallet') {
                            nodeX.push(daoWalletX);
                            nodeY.push(daoWalletY);
                        } else if (nodeName === 'Ecosystem') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(daoWalletY - 0.105);
                            interCatFlag = true;
                            senderFlag = true;
                        } else if (sender === 'Ecosystem') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                                lastEcosystemY -= 0.225
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastEcosystemY += 0.065);
                            ecosystemRecipients.push(nodeName);
                        } else if (receiver === 'Ecosystem') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                                if (senderFlag) {
                                    lastEcosystemSenderY += 0.2
                                    senderFlag = false;
                                }
                            nodeX.push(daoWalletX);
                            nodeY.push(lastEcosystemSenderY += 0.05);
                            ecosystemSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Public Goods') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastPublicGoodsY = lastEcosystemY + 0.02);
                            interCatFlag = true;
                            senderFlag = true;
                        } else if (sender === 'Public Goods') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastPublicGoodsY += 0.03);
                            publicGoodsRecipients.push(nodeName);
                        } else if (receiver === 'Public Goods') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                                if (senderFlag) {
                                    lastPublicGoodsSenderY += 0.2
                                    senderFlag = false;
                                }
                            nodeX.push(daoWalletX);
                            nodeY.push(lastPublicGoodsSenderY += 0.05);
                            publicGoodsSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Metagov') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastMetagovY = lastPublicGoodsY + 0.03);
                            interCatFlag = true;
                            senderFlag = true;
                        } else if (sender === 'Metagov') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                                lastMetagovY += 0.015
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastMetagovY += 0.03);
                            metagovRecipients.push(nodeName);
                        } else if (receiver === 'Metagov') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                                if (senderFlag) {
                                    lastMetagovSenderY += 0.2
                                    senderFlag = false;
                                }
                            nodeX.push(daoWalletX);
                            nodeY.push(lastMetagovSenderY += 0.05);
                            metagovSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Community WG') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastCommunityWGY = lastMetagovY + 0.02);
                            interCatFlag = true;
                            senderFlag = true;
                        } else if (sender === 'Community WG') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastCommunityWGY += 0.02);
                            communityWGRecipients.push(nodeName);
                        } else if (receiver === 'Community WG') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                                if (senderFlag) {
                                    lastCommunityWGSenderY += 0.2
                                    senderFlag = false;
                                }
                            nodeX.push(daoWalletX);
                            nodeY.push(lastCommunityWGSenderY += 0.05);
                            communityWGSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Service Providers') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastSpsY = lastMetagovY + 0.02);
                            interCatFlag = true;
                            senderFlag = true;
                        } else if (sender == 'Service Providers') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastSpsY += 0.02);
                            spsRecipients.push(nodeName);
                        } else if (receiver === 'Service Providers') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                                if (senderFlag) {
                                    lastSpsSenderY += 0.2
                                    senderFlag = false;
                                }
                            nodeX.push(daoWalletX);
                            nodeY.push(lastSpsSenderY += 0.05);
                            spsSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Plchld') {
                            nodeX.push(dummyNodeXY);
                            nodeY.push(dummyNodeXY);
                        } else if (sender === 'Plchld') {
                            nodeX.push(dummyNodeXY);
                            nodeY.push(dummyNodeXY);
                        }
                    } else if (categoryMode) {
                        if (nodeName === 'DAO Wallet') {
                            nodeX.push(daoWalletX);
                            nodeY.push(daoWalletY);
                        } else if (nodeName === 'Ecosystem') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastDaoWalletY = daoWalletY - 0.1);
                            interCatFlag = true;
                            senderFlag = true;
                        } else if (sender === 'Ecosystem') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                                lastEcosystemY -= 0.225
                            }
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastEcosystemY += 0.085);
                            ecosystemRecipients.push(nodeName);
                        } else if (receiver === 'Ecosystem') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                                if (senderFlag) {
                                    lastEcosystemSenderY += 0.2
                                    senderFlag = false;
                                }
                            nodeX.push(daoWalletX);
                            nodeY.push(lastEcosystemSenderY += 0.05);
                            ecosystemSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Public Goods') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastPublicGoodsY = lastEcosystemY + 0.05);
                            interCatFlag = true;
                            senderFlag = true;
                        } else if (sender === 'Public Goods') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastPublicGoodsY += 0.085);
                            publicGoodsRecipients.push(nodeName);
                        } else if (receiver === 'Public Goods') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                                if (senderFlag) {
                                    lastPublicGoodsSenderY += 0.2
                                    senderFlag = false;
                                }
                            nodeX.push(daoWalletX);
                            nodeY.push(lastPublicGoodsSenderY += 0.05);
                            publicGoodsSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Metagov') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastMetagovY = lastPublicGoodsY + 0.05);
                            interCatFlag = true;
                            senderFlag = true;
                        } else if (sender === 'Metagov') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                                lastMetagovY += 0.015
                            }
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastMetagovY += 0.085);
                            metagovRecipients.push(nodeName);
                        } else if (receiver === 'Metagov') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                                if (senderFlag) {
                                    lastMetagovSenderY += 0.2
                                    senderFlag = false;
                                }
                            nodeX.push(daoWalletX);
                            nodeY.push(lastMetagovSenderY += 0.05);
                            metagovSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Community WG') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastCommunityWGY = lastMetagovY + 0.05);
                            interCatFlag = true;
                            senderFlag = true;
                        } else if (sender === 'Community WG') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastCommunityWGY += 0.085);
                            communityWGRecipients.push(nodeName);
                        } else if (receiver === 'Community WG') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                                if (senderFlag) {
                                    lastCommunityWGSenderY += 0.2
                                    senderFlag = false;
                                }
                            nodeX.push(daoWalletX);
                            nodeY.push(lastCommunityWGSenderY += 0.05);
                            communityWGSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Service Providers') {
                            nodeX.push(specialWalletsX);
                            nodeY.push(lastSpsY = lastMetagovY + 0.05);
                            interCatFlag = true;
                            senderFlag = true;
                        } else if (sender == 'Service Providers') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.03);
                            nodeY.push(lastSpsY += 0.085);
                            spsRecipients.push(nodeName);
                        } else if (receiver === 'Service Providers') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                                if (senderFlag) {
                                    lastSpsSenderY += 0.2
                                    senderFlag = false;
                                }
                            nodeX.push(daoWalletX);
                            nodeY.push(lastSpsSenderY += 0.05);
                            spsSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Plchld') {
                            nodeX.push(dummyNodeXY);
                            nodeY.push(dummyNodeXY);
                        } else if (sender === 'Plchld') {
                            nodeX.push(dummyNodeXY);
                            nodeY.push(dummyNodeXY);
                        }
                    }

                } else if (model === 4) {
                    if (!categoryMode) {
                        if (nodeName === 'DAO Wallet') {
                            nodeX.push(daoWalletX);
                            nodeY.push(daoWalletY);
                        } else if (sender === 'DAO Wallet' && !specialWallets.hasOwnProperty(nodeName)) {
                            nodeX.push(0.95);
                            nodeY.push(daoWalletY);
                            daoWalletRecipients.push(nodeName);
                        } else if (nodeName === 'Ecosystem') {
                            nodeX.push(daoWalletX + 0.3);
                            nodeY.push(lastEcosystemY += 0.3);
                            interCatFlag = true;
                        } else if (sender === 'Ecosystem') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastEcosystemY += 0.02);
                            ecosystemRecipients.push(nodeName);
                        } else if (receiver === 'Ecosystem') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastEcosystemSenderY);
                            lastEcosystemSenderY += 0.06;
                            ecosystemSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Public Goods') {
                            nodeX.push(daoWalletX + 0.3);
                            nodeY.push(lastPublicGoodsY = lastEcosystemY + 0.02);
                            interCatFlag = true;
                        } else if (sender === 'Public Goods') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastPublicGoodsY += 0.02);
                            publicGoodsRecipients.push(nodeName);
                        } else if (receiver === 'Public Goods') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastPublicGoodsSenderY);
                            lastPublicGoodsSenderY += 0.06;
                            publicGoodsSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Metagov') {
                            nodeX.push(daoWalletX + 0.3);
                            nodeY.push(lastMetagovY = lastPublicGoodsY + 0.02);
                            interCatFlag = true;
                        } else if (sender === 'Metagov') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastMetagovY += 0.02);
                            metagovRecipients.push(nodeName);
                        } else if (receiver === 'Metagov') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastMetagovSenderY);
                            lastMetagovSenderY += 0.06;
                            metagovSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Community WG') {
                            nodeX.push(daoWalletX + 0.1);
                            nodeY.push(lastCommunityWGY = lastMetagovY + 0.02);
                            interCatFlag = true;
                        } else if (sender === 'Community WG') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastCommunityWGY += 0.02);
                            communityWGRecipients.push(nodeName);
                        } else if (receiver === 'Community WG') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastCommunityWGSenderY);
                            lastCommunityWGSenderY += 0.06;
                            communityWGSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Service Providers') {
                            nodeX.push(daoWalletX + 0.1);
                            nodeY.push(lastSpsY = lastMetagovY + 0.02);
                            interCatFlag = true;
                        } else if (sender == 'Service Providers') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastSpsY += 0.02);
                            spsRecipients.push(nodeName);
                        } else if (receiver === 'Service Providers') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastSpsSenderY);
                            lastSpsSenderY += 0.06;
                            spsSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Plchld') {
                            nodeX.push(-10000);
                            nodeY.push(-10000);
                        } else if (sender === 'Plchld') {
                            nodeX.push(-10000);
                            nodeY.push(-10000);
                        }

                    } else if (categoryMode) {
                        if (nodeName === 'DAO Wallet') {
                            nodeX.push(daoWalletX);
                            nodeY.push(daoWalletY);
                        } else if (sender === 'DAO Wallet' && !specialWallets.hasOwnProperty(nodeName)) {
                            nodeX.push(0.95);
                            nodeY.push(daoWalletY);
                            daoWalletRecipients.push(nodeName);
                        } else if (nodeName === 'Ecosystem') {
                            nodeX.push(daoWalletX + 0.3);
                            nodeY.push(lastEcosystemY += daoWalletY + 0.4);
                            interCatFlag = true;
                        } else if (sender === 'Ecosystem') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastEcosystemY += 0.05);
                            ecosystemRecipients.push(nodeName);
                        } else if (receiver === 'Ecosystem') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastEcosystemSenderY);
                            lastEcosystemSenderY += 0.06;
                            ecosystemSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Public Goods') {
                            nodeX.push(daoWalletX + 0.3);
                            nodeY.push(lastPublicGoodsY = lastEcosystemY + 0.05);
                            interCatFlag = true;
                        } else if (sender === 'Public Goods') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastPublicGoodsY += 0.05);
                            publicGoodsRecipients.push(nodeName);
                        } else if (receiver === 'Public Goods') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastPublicGoodsSenderY);
                            lastPublicGoodsSenderY += 0.06;
                            publicGoodsSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Metagov') {
                            nodeX.push(daoWalletX + 0.3);
                            nodeY.push(lastMetagovY = lastPublicGoodsY + 0.05);
                            interCatFlag = true;
                        } else if (sender === 'Metagov') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastMetagovY += 0.05);
                            metagovRecipients.push(nodeName);
                        } else if (receiver === 'Metagov') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastMetagovSenderY);
                            lastMetagovSenderY += 0.06;
                            metagovSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Community WG') {
                            nodeX.push(daoWalletX + 0.1);
                            nodeY.push(lastCommunityWGY = lastMetagovY + 0.05);
                            interCatFlag = true;
                        } else if (sender === 'Community WG') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastCommunityWGY += 0.05);
                            communityWGRecipients.push(nodeName);
                        } else if (receiver === 'Community WG') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastCommunityWGSenderY);
                            lastCommunityWGSenderY += 0.06;
                            communityWGSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Service Providers') {
                            nodeX.push(daoWalletX + 0.1);
                            nodeY.push(lastSpsY = lastMetagovY + 0.05);
                            interCatFlag = true;
                        } else if (sender == 'Service Providers') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastSpsY += 0.5);
                            spsRecipients.push(nodeName);
                        } else if (receiver === 'Service Providers') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastSpsSenderY);
                            lastSpsSenderY += 0.06;
                            spsSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Plchld') {
                            nodeX.push(-10000);
                            nodeY.push(-10000);
                        } else if (sender === 'Plchld') {
                            nodeX.push(-10000);
                            nodeY.push(-10000);
                        }
                    }

                } else if (model === 5) {
                    if (!categoryMode) {
                        if (nodeName === 'DAO Wallet') {
                            nodeX.push(daoWalletX);
                            nodeY.push(daoWalletY);
                        } else if (sender === 'DAO Wallet' && !specialWallets.hasOwnProperty(nodeName)) {
                            nodeX.push(0.95);
                            nodeY.push(daoWalletY -= 0.1);
                            daoWalletRecipients.push(nodeName);
                            console.log(daoWalletRecipients.length)
                        } else if (nodeName === 'Ecosystem') {
                            nodeX.push(daoWalletX + 0.175);
                            nodeY.push(lastEcosystemY = daoWalletY + (daoWalletRecipients.length * 0.15));
                            lastEcosystemSenderY = lastEcosystemY + 0.2;
                            interCatFlag = true;
                        } else if (sender === 'Ecosystem') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                lastEcosystemY -= 0.05;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastEcosystemY += 0.01535);
                            ecosystemRecipients.push(nodeName);
                        } else if (receiver === 'Ecosystem') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastEcosystemSenderY);
                            lastEcosystemSenderY += 0.06;
                            ecosystemSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Public Goods') {
                            nodeX.push(daoWalletX + 0.175);
                            nodeY.push(lastPublicGoodsY = lastEcosystemY + 0.03);
                            interCatFlag = true;
                        } else if (sender === 'Public Goods') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastPublicGoodsY += 0.01535);
                            publicGoodsRecipients.push(nodeName);
                        } else if (receiver === 'Public Goods') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX + 0.1);
                            nodeY.push(lastPublicGoodsSenderY);
                            lastPublicGoodsSenderY += 0.06;
                            publicGoodsSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Metagov') {
                            nodeX.push(daoWalletX + 0.175);
                            nodeY.push(lastMetagovY = lastPublicGoodsY + 0.08);
                            lastMetagovSenderY = lastMetagovY;
                            console.log(lastMetagovSenderY)
                            interCatFlag = true;
                        } else if (sender === 'Metagov') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastMetagovY += 0.01535);
                            metagovRecipients.push(nodeName);
                        } else if (receiver === 'Metagov') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastMetagovSenderY);
                            lastMetagovSenderY += 0.04;
                            metagovSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Community WG') {
                            nodeX.push(daoWalletX + 0.175);
                            nodeY.push(lastCommunityWGY = lastMetagovY + 0.02);
                            interCatFlag = true;
                        } else if (sender === 'Community WG') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastCommunityWGY += 0.01535);
                            communityWGRecipients.push(nodeName);
                        } else if (receiver === 'Community WG') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX + 0.1);
                            nodeY.push(lastCommunityWGSenderY);
                            lastCommunityWGSenderY += 0.06;
                            communityWGSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Service Providers') {
                            nodeX.push(daoWalletX + 0.175);
                            nodeY.push(lastSpsY = lastMetagovY + 0.02);
                            interCatFlag = true;
                        } else if (sender == 'Service Providers') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastSpsY += 0.025);
                            spsRecipients.push(nodeName);
                        } else if (receiver === 'Service Providers') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX + 0.1);
                            nodeY.push(lastSpsSenderY);
                            lastSpsSenderY += 0.06;
                            spsSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Plchld') {
                            nodeX.push(dummyNodeXY);
                            nodeY.push(dummyNodeXY);
                        } else if (sender === 'Plchld') {
                            nodeX.push(dummyNodeXY);
                            nodeY.push(dummyNodeXY);
                        }
                        console.log(`Node ${nodeName}: X=${nodeX[nodeIndices[nodeName]]}, Y=${nodeY[nodeIndices[nodeName]]}`);
                    } else if (categoryMode) {
                        if (nodeName === 'DAO Wallet') {
                            nodeX.push(daoWalletX);
                            nodeY.push(daoWalletY);
                        } else if (sender === 'DAO Wallet' && !specialWallets.hasOwnProperty(nodeName)) {
                            nodeX.push(0.95);
                            nodeY.push(daoWalletY -= 0.1);
                            daoWalletRecipients.push(nodeName);
                            console.log(daoWalletRecipients.length)
                        } else if (nodeName === 'Ecosystem') {
                            nodeX.push(daoWalletX + 0.175);
                            nodeY.push(lastEcosystemY = daoWalletY + 0.1 + (daoWalletRecipients.length * 0.15));
                            lastEcosystemSenderY = lastEcosystemY + 0.2;
                            interCatFlag = true;
                        } else if (sender === 'Ecosystem') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                lastEcosystemY -= 0.05;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastEcosystemY += 0.05);
                            ecosystemRecipients.push(nodeName);
                        } else if (receiver === 'Ecosystem') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastEcosystemSenderY += 0.1);
                            ecosystemSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Public Goods') {
                            nodeX.push(daoWalletX + 0.175);
                            nodeY.push(lastPublicGoodsY = lastEcosystemY + 0.03);
                            interCatFlag = true;
                        } else if (sender === 'Public Goods') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastPublicGoodsY += 0.05);
                            publicGoodsRecipients.push(nodeName);
                        } else if (receiver === 'Public Goods') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX + 0.1);
                            nodeY.push(lastPublicGoodsSenderY += 0.1);
                            publicGoodsSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Metagov') {
                            nodeX.push(daoWalletX + 0.175);
                            nodeY.push(lastMetagovY = lastPublicGoodsY + 0.08);
                            lastMetagovSenderY = lastMetagovY;
                            console.log(lastMetagovSenderY)
                            interCatFlag = true;
                        } else if (sender === 'Metagov') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastMetagovY += 0.05);
                            metagovRecipients.push(nodeName);
                        } else if (receiver === 'Metagov') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastMetagovSenderY += 0.1);
                            metagovSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Community WG') {
                            nodeX.push(daoWalletX + 0.175);
                            nodeY.push(lastCommunityWGY = lastMetagovY + 0.02);
                            interCatFlag = true;
                        } else if (sender === 'Community WG') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastCommunityWGY += 0.05);
                            communityWGRecipients.push(nodeName);
                        } else if (receiver === 'Community WG') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX + 0.1);
                            nodeY.push(lastCommunityWGSenderY += 0.1);
                            communityWGSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Service Providers') {
                            nodeX.push(daoWalletX + 0.175);
                            nodeY.push(lastSpsY = lastMetagovY + 0.02);
                            interCatFlag = true;
                        } else if (sender == 'Service Providers') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastSpsY += 0.05);
                            spsRecipients.push(nodeName);
                        } else if (receiver === 'Service Providers') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX + 0.1);
                            nodeY.push(lastSpsSenderY += 0.1);
                            spsSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Plchld') {
                            nodeX.push(dummyNodeXY);
                            nodeY.push(dummyNodeXY);
                        } else if (sender === 'Plchld') {
                            nodeX.push(dummyNodeXY);
                            nodeY.push(dummyNodeXY);
                        }
                    }

                } else if (model === 'detailed') {
                } else if (model === 'dissolution') {
                    if (!categoryMode) {
                        if (nodeName === 'DAO Wallet') {
                            nodeX.push(daoWalletX);
                            nodeY.push(daoWalletY);
                        } else if (sender === 'DAO Wallet' && !specialWallets.hasOwnProperty(nodeName)) {
                            nodeX.push(0.95);
                            nodeY.push(daoWalletY -= 0.1);
                            daoWalletRecipients.push(nodeName);
                            console.log(daoWalletRecipients.length)
                        } else if (nodeName === 'Ecosystem') {
                            nodeX.push(daoWalletX + 0.175);
                            nodeY.push(lastEcosystemY = daoWalletY + 0.1 + (daoWalletRecipients.length * 0.1));
                            lastEcosystemSenderY = lastEcosystemY + 0.2;
                            interCatFlag = true;
                        } else if (sender === 'Ecosystem') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                lastEcosystemY -= 0.05;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastEcosystemY += 0.025);
                            ecosystemRecipients.push(nodeName);
                        } else if (receiver === 'Ecosystem') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastEcosystemSenderY);
                            lastEcosystemSenderY += 0.06;
                            ecosystemSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Public Goods') {
                            nodeX.push(daoWalletX + 0.175);
                            nodeY.push(lastPublicGoodsY = lastEcosystemY + 0.03);
                            interCatFlag = true;
                        } else if (sender === 'Public Goods') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastPublicGoodsY += 0.025);
                            publicGoodsRecipients.push(nodeName);
                        } else if (receiver === 'Public Goods') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX + 0.1);
                            nodeY.push(lastPublicGoodsSenderY);
                            lastPublicGoodsSenderY += 0.06;
                            publicGoodsSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Metagov') {
                            nodeX.push(daoWalletX + 0.175);
                            nodeY.push(lastMetagovY = lastPublicGoodsY + 0.08);
                            lastMetagovSenderY = lastMetagovY;
                            console.log(lastMetagovSenderY)
                            interCatFlag = true;
                        } else if (sender === 'Metagov') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastMetagovY += 0.025);
                            metagovRecipients.push(nodeName);
                        } else if (receiver === 'Metagov') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastMetagovSenderY);
                            lastMetagovSenderY += 0.04;
                            metagovSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Community WG') {
                            nodeX.push(daoWalletX + 0.175);
                            nodeY.push(lastCommunityWGY = lastMetagovY + 0.02);
                            interCatFlag = true;
                        } else if (sender === 'Community WG') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastCommunityWGY += 0.025);
                            communityWGRecipients.push(nodeName);
                        } else if (receiver === 'Community WG') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX + 0.1);
                            nodeY.push(lastCommunityWGSenderY);
                            lastCommunityWGSenderY += 0.06;
                            communityWGSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Service Providers') {
                            nodeX.push(daoWalletX + 0.175);
                            nodeY.push(lastSpsY = lastMetagovY + 0.02);
                            interCatFlag = true;
                        } else if (sender == 'Service Providers') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastSpsY += 0.025);
                            spsRecipients.push(nodeName);
                        } else if (receiver === 'Service Providers') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX + 0.1);
                            nodeY.push(lastSpsSenderY);
                            lastSpsSenderY += 0.06;
                            spsSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Plchld') {
                            nodeX.push(dummyNodeXY);
                            nodeY.push(dummyNodeXY);
                        } else if (sender === 'Plchld') {
                            nodeX.push(dummyNodeXY);
                            nodeY.push(dummyNodeXY);
                        }
                        console.log(`Node ${nodeName}: X=${nodeX[nodeIndices[nodeName]]}, Y=${nodeY[nodeIndices[nodeName]]}`);
                    } else if (categoryMode) {
                        if (nodeName === 'DAO Wallet') {
                            nodeX.push(daoWalletX);
                            nodeY.push(daoWalletY);
                        } else if (sender === 'DAO Wallet' && !specialWallets.hasOwnProperty(nodeName)) {
                            nodeX.push(0.95);
                            nodeY.push(daoWalletY -= 0.1);
                            daoWalletRecipients.push(nodeName);
                            console.log(daoWalletRecipients.length)
                        } else if (nodeName === 'Ecosystem') {
                            nodeX.push(daoWalletX + 0.175);
                            nodeY.push(lastEcosystemY = daoWalletY + 0.2 + (daoWalletRecipients.length * 0.1));
                            lastEcosystemSenderY = lastEcosystemY + 0.2;
                            interCatFlag = true;
                        } else if (sender === 'Ecosystem') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                lastEcosystemY -= 0.05;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastEcosystemY += 0.035);
                            ecosystemRecipients.push(nodeName);
                        } else if (receiver === 'Ecosystem') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastEcosystemSenderY);
                            lastEcosystemSenderY += 0.06;
                            ecosystemSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Public Goods') {
                            nodeX.push(daoWalletX + 0.175);
                            nodeY.push(lastPublicGoodsY = lastEcosystemY + 0.03);
                            interCatFlag = true;
                        } else if (sender === 'Public Goods') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastPublicGoodsY += 0.035);
                            publicGoodsRecipients.push(nodeName);
                        } else if (receiver === 'Public Goods') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX + 0.1);
                            nodeY.push(lastPublicGoodsSenderY);
                            lastPublicGoodsSenderY += 0.06;
                            publicGoodsSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Metagov') {
                            nodeX.push(daoWalletX + 0.175);
                            nodeY.push(lastMetagovY = lastPublicGoodsY + 0.08);
                            lastMetagovSenderY = lastMetagovY;
                            console.log(lastMetagovSenderY)
                            interCatFlag = true;
                        } else if (sender === 'Metagov') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastMetagovY += 0.035);
                            metagovRecipients.push(nodeName);
                        } else if (receiver === 'Metagov') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX);
                            nodeY.push(lastMetagovSenderY);
                            lastMetagovSenderY += 0.04;
                            metagovSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Community WG') {
                            nodeX.push(daoWalletX + 0.175);
                            nodeY.push(lastCommunityWGY = lastMetagovY + 0.02);
                            interCatFlag = true;
                        } else if (sender === 'Community WG') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastCommunityWGY += 0.035);
                            communityWGRecipients.push(nodeName);
                        } else if (receiver === 'Community WG') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX + 0.1);
                            nodeY.push(lastCommunityWGSenderY);
                            lastCommunityWGSenderY += 0.06;
                            communityWGSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Service Providers') {
                            nodeX.push(daoWalletX + 0.175);
                            nodeY.push(lastSpsY = lastMetagovY + 0.02);
                            interCatFlag = true;
                        } else if (sender == 'Service Providers') {
                            if (interCatFlag) {
                                lastX = 0.97;
                                interCatFlag = false;
                            }
                            nodeX.push(lastX -= 0.02);
                            nodeY.push(lastSpsY += 0.035);
                            spsRecipients.push(nodeName);
                        } else if (receiver === 'Service Providers') {
                            if (!specialWallets.hasOwnProperty(sender)) {
                            nodeX.push(daoWalletX + 0.1);
                            nodeY.push(lastSpsSenderY);
                            lastSpsSenderY += 0.06;
                            spsSenders.push(nodeName);
                            }
                        } else if (nodeName === 'Plchld') {
                            nodeX.push(dummyNodeXY);
                            nodeY.push(dummyNodeXY);
                        } else if (sender === 'Plchld') {
                            nodeX.push(dummyNodeXY);
                            nodeY.push(dummyNodeXY);
                        }
                    }

                } else {
                }
            }
            return nodeIndices[nodeName];
        }
    };

    // Call
    df.forEach(row => {
        const sender = categoryMode ? row.From_category : row.From_name;
        const receiver = categoryMode ? row.To_category : row.To_name;
        const value = row.DOT_USD;
        const color = colorMap[row.Symbol] || 'gray';
        const label = `Date: ${row.Date}<br>Receipt: ${row['Transaction Hash']}<br>Token Amount: ${row.Value} ${row.Symbol} <br>USD Amount: ${row.DOT_USD}`;
        const qtr = row.Quarter;

        if (bigPicture) {
            const qtr = row['From_name'] !== 'Plchld' ? row.Quarter : undefined;
            const value = row['From_name'] !== 'Plchld' ? row.DOT_USD : 1;
            const nextQuarter = row['Transaction Hash'] === 'Interquarter' ? getNextQuarter(qtr) : qtr;
            const senderIndex = getNodeIndex(`${sender} (${qtr})`, sender, receiver, model, qtr);
            const receiverIndex = getNodeIndex(`${receiver} (${nextQuarter})`, sender, receiver, model, nextQuarter);

            linkSources.push(senderIndex);
            linkTargets.push(receiverIndex);
            linkValues.push(value);
            linkColors.push(color);
            linkLabels.push(label);

            flowData[qtr] = flowData[qtr] || [];
            flowData[qtr].push({
                sender: sender,
                receiver: receiver,
                value: value,
                color: color,
                label: label
            });

            return;

        } else if (!bigPicture) {
            const senderIndex = getNodeIndex(sender, sender, receiver, model, qtr);
            const receiverIndex = getNodeIndex(receiver, sender, receiver, model, qtr);
    
            linkSources.push(senderIndex);
            linkTargets.push(receiverIndex);
            linkValues.push(value);
            linkColors.push(color);
            linkLabels.push(label);
    
            flowData[qtr].push({
                sender: sender,
                receiver: receiver,
                value: value,
                color: color,
                label: label
            });
            return;
        }

        if (!flowData[qtr]) {
            flowData[qtr] = [];
        }
    });

    let conditions = {
        condition1: condition1 ? '+' : '-',
        condition2: condition2 ? '+' : '-',
        condition3: condition3 ? '+' : '-',
        model: model,
        quarterCount: quarterCount
    };

    saveFlowDataToJSON(flowData);

    return {
        nodes: nodes.map((node, index) => {
            const nodeName = node.split(' (')[0];
            return { name: nodeName, customdata: nodeCustomdata[index], color: nodeColors[index], x: nodeX[index], y: nodeY[index] };
        }),
        links: linkSources.map((source, index) => ({
            source: source,
            target: linkTargets[index],
            value: linkValues[index],
            color: linkColors[index],
            label: linkLabels[index]
        })),
        conditions: conditions
    };
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/quarters', (req, res) => {
    const uniqueQuarters = Array.from(new Set(df.map(row => row.Quarter)))
        .filter(quarter => {
            const [year, q] = quarter.split('Q');
            return parseInt(year) > 2022 || (parseInt(year) === 2022 && parseInt(q) >= 2);
        });
    res.json({ quarters: uniqueQuarters });
});

app.get('/data/big_picture', (req, res) => {
    try {
        const walletFilter = req.query.wallet;
        const categoryMode = req.query.category === 'true';
        const sankeyData = createSankeyData(df, true, null, walletFilter, categoryMode);
        res.json(sankeyData);
    } catch (error) {
        console.error('Error creating Sankey data:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/data/:quarter', (req, res) => {
    try {
        const quarter = req.params.quarter;
        const [year, q] = quarter.split('Q');
        if (parseInt(year) < 2022 || (parseInt(year) === 2022 && parseInt(q) < 2)) {
            return res.status(400).send('Invalid quarter: data not available for quarters before 2022Q2');
        }

        const walletFilter = req.query.wallet;
        const categoryMode = req.query.category === 'true';

        let filteredDf = df.filter(row => row.Quarter === quarter && row['Transaction Hash'] !== 'Interquarter' && row['From_name'] !== 'New ETH Registrar Controller' && row['From_name'] !== 'Old ETH Registrar Controller');
        
        if (walletFilter) {
            if (categoryMode) {
                filteredDf = filteredDf.filter(row => row.From_category === walletFilter || row.To_category === walletFilter || row['Transaction Hash'] === walletFilter);
            } else {
                filteredDf = filteredDf.filter(row => row.From_name === walletFilter || row.To_name === walletFilter || row['Transaction Hash'] === walletFilter);
            }
        }

        const sankeyData = createSankeyData(filteredDf, false, quarter, walletFilter, categoryMode);
        res.json(sankeyData);
    } catch (error) {
        console.error('Error creating Sankey data:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});
