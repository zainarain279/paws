const fs = require('fs');
const path = require('path');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');
const { DateTime } = require('luxon');

class PawsClient {
    constructor() {
        this.headers = {
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
            "Content-Type": "application/json",
            "Origin": "https://app.paws.community",
            "Referer": "https://app.paws.community/",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-site",
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1"
        };
        this.tokenFile = path.join(__dirname, 'token.json');
        this.tokens = this.loadTokens();
        this.wallets = this.loadWallets();
    }

    loadWallets() {
        try {
            const walletFile = path.join(__dirname, 'wallet.txt');
            if (fs.existsSync(walletFile)) {
                return fs.readFileSync(walletFile, 'utf8')
                    .replace(/\r/g, '')
                    .split('\n')
                    .filter(Boolean);
            }
            return [];
        } catch (error) {
            this.log(`Error reading file wallet: ${error.message}`, 'error');
            return [];
        }
    }

    async makeRequest(config, maxRetries = 3, retryDelay = 5000) {
        let attempt = 1;
        while (attempt <= maxRetries) {
            try {
                const response = await axios(config);
                return response;
            } catch (error) {
                if (attempt === maxRetries) {
                    throw error;
                }
                this.log(`The first try ${attempt}/${maxRetries} failure: ${error.message}. Try again later ${retryDelay/1000}s...`, 'warning');
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                attempt++;
            }
        }
    }

    async linkWallet(token, wallet) {
        const url = "https://api.paws.community/v1/user/wallet";
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`
        };

        try {
            const response = await this.makeRequest({
                method: 'post',
                url: url,
                headers: headers,
                data: { wallet }
            });
            
            if (response.status === 201 && response.data.success) {
                return { success: true };
            } else {
                return { success: false, error: 'Failed to link wallet' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    loadTokens() {
        try {
            if (fs.existsSync(this.tokenFile)) {
                return JSON.parse(fs.readFileSync(this.tokenFile, 'utf8'));
            }
            return {};
        } catch (error) {
            this.log(`Error reading file token: ${error.message}`, 'error');
            return {};
        }
    }

    saveToken(userId, token) {
        this.tokens[userId] = token;
        try {
            fs.writeFileSync(this.tokenFile, JSON.stringify(this.tokens, null, 2));
            this.log(`Saved tokens for user ${userId}`, 'success');
        } catch (error) {
            this.log(`Error saving token: ${error.message}`, 'error');
        }
    }

    isExpired(token) {
        const [header, payload, sign] = token.split('.');
        const decodedPayload = Buffer.from(payload, 'base64').toString();
        
        try {
            const parsedPayload = JSON.parse(decodedPayload);
            const now = Math.floor(DateTime.now().toSeconds());
            
            if (parsedPayload.exp) {
                const expirationDate = DateTime.fromSeconds(parsedPayload.exp).toLocal();
                this.log(`Token expires on: ${expirationDate.toFormat('yyyy-MM-dd HH:mm:ss')}`.cyan);
                
                const isExpired = now > parsedPayload.exp;
                this.log(`Has the token expired? ${isExpired ? 'Yes, you need to replace the token' : 'Not yet..go for it'}`.cyan);
                
                return isExpired;
            } else {
                this.log(`Perpetual Token Unreadable Expiry Time`, 'warning');
                return false;
            }
        } catch (error) {
            this.log(`Error: ${error.message}`, 'error');
            return true;
        }
    }

    log(msg, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        switch(type) {
            case 'success':
                console.log(`[${timestamp}] [*] ${msg}`.green);
                break;
            case 'custom':
                console.log(`[${timestamp}] [*] ${msg}`.magenta);
                break;        
            case 'error':
                console.log(`[${timestamp}] [!] ${msg}`.red);
                break;
            case 'warning':
                console.log(`[${timestamp}] [*] ${msg}`.yellow);
                break;
            default:
                console.log(`[${timestamp}] [*] ${msg}`.blue);
        }
    }

    async countdown(seconds) {
        for (let i = seconds; i >= 0; i--) {
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(`===== Wait ${i} seconds to continue loop =====`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        this.log('', 'info');
    }

    async authenticate(initData) {
        const url = "https://api.paws.community/v1/user/auth";
        const payload = {
            data: initData,
            referralCode: ''
        };

        try {
            const response = await this.makeRequest({
                method: 'post',
                url: url,
                data: payload,
                headers: this.headers
            });
            
            if (response.status === 201 && response.data.success) {
                const token = response.data.data[0];
                const userData = response.data.data[1];
                return {
                    success: true,
                    token: token,
                    balance: userData.gameData.balance,
                    username: userData.userData.username,
                    firstname: userData.userData.firstname,
                    wallet: userData.userData.wallet
                };
            } else {
                return { success: false, error: 'Authentication failed' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getUserInfo(token) {
        const url = "https://api.paws.community/v1/user";
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`
        };

        try {
            const response = await this.makeRequest({
                method: 'get',
                url: url,
                headers: headers
            });
            
            if (response.status === 200 && response.data.success) {
                const userData = response.data.data;
                return {
                    success: true,
                    balance: userData.gameData.balance,
                    wallet: userData.userData.wallet
                };
            } else {
                return { success: false, error: 'Failed to get user info' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    validateWalletFile() {
        const dataFile = path.join(__dirname, 'data.txt');
        const data = fs.readFileSync(dataFile, 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);

        if (this.wallets.length !== data.length) {
            this.log(`Number of wallets (${this.wallets.length}) and data (${data.length}) do not match!`, 'error');
            return false;
        }
        return true;
    }

    
    async getQuestsList(token) {
        const url = "https://api.paws.community/v1/quests/list";
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`
        };

        try {
            const response = await this.makeRequest({
                method: 'get',
                url: url,
                headers: headers
            });
            
            if (response.status === 200 && response.data.success) {
                return {
                    success: true,
                    data: response.data.data.filter(quest => !quest.progress.claimed)
                };
            } else {
                return { success: false, error: 'Failed to get quests list' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async completeQuest(token, questId) {
        const url = "https://api.paws.community/v1/quests/completed";
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`
        };
    
        try {
            const response = await this.makeRequest({
                method: 'post',
                url: url,
                headers: headers,
                data: { questId }
            });
            
            const statusCode = response.status;
            const { success, data } = response.data;
            
            if (statusCode === 200 || statusCode === 201) {
                if (success) {
                    return { success: true, data: data };
                } else {
                    if (data === true) {
                        this.log(`Quest ${questId} not completed, in progress claim...`, 'info');
                        await this.claimQuest(token, questId, { title: `Quest ${questId}`, rewards: [{ amount: 0 }] }); 
                    } else if (data === false) {
                        this.log(`Not qualified to complete the mission ${questId}`, 'warning');
                    }
                }
            } else {
                return { success: false, error: 'Unexpected response status' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }    

    async claimQuest(token, questId, questData) {
        const url = "https://api.paws.community/v1/quests/claim";
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`
        };

        try {
            const response = await this.makeRequest({
                method: 'post',
                url: url,
                headers: headers,
                data: { questId }
            });
            
            if (response) {
                const reward = questData.rewards[0].amount;
                this.log(`Do the task ${questData.title} success | reward : ${reward}`, 'success');
                return { success: true };
            } else {
                return { success: false, error: 'Failed to claim quest reward' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async processQuests(token) {
        try {
            const questsResult = await this.getQuestsList(token);
            if (!questsResult.success) {
                this.log(`Error while getting task list: ${questsResult.error}`, 'error');
                return;
            }

            const unclaimedQuests = questsResult.data;
            
            for (const quest of unclaimedQuests) {
                this.log(`Processing task: ${quest.title}`, 'info');
                
                const completeResult = await this.completeQuest(token, quest._id);
                if (!completeResult.success) {
                    this.log(`Error completing task ${quest.title}: ${completeResult.error}`, 'error');
                    continue;
                }

                const claimResult = await this.claimQuest(token, quest._id, quest);
                if (!claimResult.success) {
                    this.log(`Error when receiving quest reward ${quest.title}: ${claimResult.error}`, 'error');
                    continue;
                }

                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } catch (error) {
            this.log(`Error while processing the task: ${error.message}`, 'error');
        }
    }

    askQuestion(query) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        return new Promise(resolve => rl.question(query, ans => {
            rl.close();
            resolve(ans);
        }))
    }

    async getChristmasQuests(token) {
        const url = "https://api.paws.community/v1/quests/list?type=christmas";
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`
        };

        try {
            const response = await this.makeRequest({
                method: 'get',
                url: url,
                headers: headers
            });
            
            if (response.status === 200 && response.data.success) {
                return {
                    success: true,
                    data: response.data.data.filter(quest => 
                        quest.code.startsWith('christmas') && 
                        parseInt(quest.code.slice(9)) <= 6 && 
                        !quest.progress.claimed &&
                        quest.progress.status !== 'finished'
                    )
                };
            } else {
                return { success: false, error: 'Failed to get Christmas quests list' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async processChristmasQuests(token) {
        try {
            const questsResult = await this.getChristmasQuests(token);
            if (!questsResult.success) {
                this.log(`Error when getting Christmas quest list: ${questsResult.error}`, 'error');
                return;
            }

            const christmasQuests = questsResult.data;
            
            for (const quest of christmasQuests) {
                this.log(`Processing Christmas quest: ${quest.title}`, 'info');
                
                const completeResult = await this.makeRequest({
                    method: 'post',
                    url: 'https://api.paws.community/v1/quests/completed',
                    headers: {
                        ...this.headers,
                        "Authorization": `Bearer ${token}`
                    },
                    data: { questId: quest._id }
                });

                if (completeResult.status === 200 || completeResult.status === 201) {
                    const claimResult = await this.makeRequest({
                        method: 'post',
                        url: 'https://api.paws.community/v1/quests/claim',
                        headers: {
                            ...this.headers,
                            "Authorization": `Bearer ${token}`
                        },
                        data: { questId: quest._id }
                    });

                    if (claimResult && claimResult.data.success) {
                        if (claimResult.data.data && claimResult.data.data.amount !== undefined) {
                            this.log(`Claim Christmas successfully, received ${claimResult.data.data.amount} PAWS`, 'success');
                        }
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        } catch (error) {
            this.log(`Error while processing Christmas quest: ${error.message}`, 'error');
        }
    }

    async main() {
        if (!this.validateWalletFile()) {
            process.exit(1);
        }

        const dataFile = path.join(__dirname, 'data.txt');
        const data = fs.readFileSync(dataFile, 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);

        this.log('Tool shared on Dan Cay Airdrop telegram channel (https://t.me/AirdropScript6)'.green);
    
        const nhiemvu = await this.askQuestion('Do you want to do the quest? (y/n)): ');
        const hoinhiemvu = nhiemvu.toLowerCase() === 'y';

        const christmas = await this.askQuestion('Do you want to do Christmas mission? (y/n): ');
        const lamChristmas = christmas.toLowerCase() === 'y';

        while (true) {
            for (let i = 0; i < data.length; i++) {
                const initData = data[i];
                const userData = JSON.parse(decodeURIComponent(initData.split('user=')[1].split('&')[0]));
                const userId = userData.id;
                const firstName = userData.first_name;
                const walletAddress = this.wallets[i];

                console.log(`========== Account ${i + 1} | ${firstName.green} ==========`);
                
                let userToken = this.tokens[userId];
                let needsNewToken = !userToken || this.isExpired(userToken);

                if (needsNewToken) {
                    this.log(`Need new token for user ${userId}`, 'warning');
                    const authResult = await this.authenticate(initData);
                    if (authResult.success) {
                        userToken = authResult.token;
                        this.saveToken(userId, userToken);
                        this.log(`Balance: ${authResult.balance.toString().magenta}`, 'custom');
                        
                        if (authResult.wallet) {
                            this.log(`Account linked to wallet: ${authResult.wallet}`, 'success');
                        } else {
                            this.log(`The account has not linked wallet. Proceed to link...`, 'warning');
                            const linkResult = await this.linkWallet(userToken, walletAddress);
                            if (linkResult.success) {
                                this.log(`Wallet linked successfully: ${walletAddress}`, 'success');
                            } else {
                                this.log(`Error linking wallet: ${linkResult.error}`, 'error');
                            }
                        }
                    } else {
                        this.log(`Login failed! ${authResult.error}`, 'error');
                        continue;
                    }
                } else {
                    this.log(`Use existing token for user ${userId}`, 'info');
                    const userInfo = await this.getUserInfo(userToken);
                    if (userInfo.success) {
                        this.log(`Balance: ${userInfo.balance.toString().magenta}`, 'custom');
                        
                        if (userInfo.wallet) {
                            this.log(`Account linked to wallet: ${userInfo.wallet}`, 'success');
                        } else {
                            this.log(`The account has not linked wallet. Proceed to link...`, 'warning');
                            const linkResult = await this.linkWallet(userToken, walletAddress);
                            if (linkResult.success) {
                                this.log(`Wallet linked successfully: ${walletAddress}`, 'success');
                            } else {
                                this.log(`Error linking wallet: ${linkResult.error}`, 'error');
                            }
                        }
                    } else {
                        this.log(`Error getting user information: ${userInfo.error}`, 'error');
                    }
                }
                if (hoinhiemvu) {
                    this.log(`Checking mission...`, 'info');
                    await this.processQuests(userToken);
                }
                if (lamChristmas) {
                    this.log(`Checking Christmas quest...`, 'info');
                    await this.processChristmasQuests(userToken);
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            await this.countdown(1440 * 60);
        }
    }
}

const client = new PawsClient();
client.main().catch(err => {
    client.log(err.message, 'error');
    process.exit(1);
});