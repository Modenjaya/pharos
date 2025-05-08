// Auto Swap Script untuk ZenithSwap (PHRS ke USDC) dengan multiple akun dan transfer ke random address
const ethers = require('ethers');
const readline = require('readline');
require('dotenv').config();

// Konfigurasi
const RPC_URL = 'https://testnet.dplabs-internal.com';
const ROUTER_ADDRESS = '0x1a4de519154ae51200b0ad7c90f7fac75547888a'; // ZenithSwap Router
const USDC_ADDRESS = '0xad902cf99c2de2f1ba5ec4d642fd7e49cae9ee37'; // USDC address
const WPHRS_ADDRESS = '0x76aaada469d23216be5f7c596fa25f282ff9b364'; // WPHRS address
const SWAP_AMOUNT = '1000000000000000'; // 0.001 PHRS dalam wei (10^15 wei)
const TRANSFER_AMOUNT = '1000000000000000'; // 0.001 PHRS untuk transfer
const GAS_LIMIT = 2000000;

// Fungsi untuk membaca private keys dari format individual (PRIVATE_KEY1, PRIVATE_KEY2, dst)
function getPrivateKeys() {
    const privateKeys = [];
    let keyIndex = 1;
    let keyName = `PRIVATE_KEY${keyIndex}`;
    
    // Check apakah format lama (PRIVATE_KEYS atau PRIVATE_KEY) digunakan
    if (process.env.PRIVATE_KEYS) {
        return process.env.PRIVATE_KEYS.split(',');
    }
    
    if (process.env.PRIVATE_KEY && !process.env.PRIVATE_KEY1) {
        return [process.env.PRIVATE_KEY];
    }
    
    // Baca private key dengan format PRIVATE_KEY1, PRIVATE_KEY2, dst
    while (process.env[keyName]) {
        privateKeys.push(process.env[keyName]);
        keyIndex++;
        keyName = `PRIVATE_KEY${keyIndex}`;
    }
    
    return privateKeys;
}

// Dapatkan private keys
const PRIVATE_KEYS = getPrivateKeys();

// Fungsi untuk input interaktif
function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

// Fungsi untuk menghasilkan random Ethereum address
function generateRandomAddress() {
    const wallet = ethers.Wallet.createRandom();
    return wallet.address;
}

// Fungsi untuk melakukan swap PHRS ke USDC
async function performSwap(wallet) {
    try {
        console.log(`Memulai swap 0.001 PHRS ke USDC dari akun ${wallet.address}...`);
        
        // ABI untuk exactInputSingle (V3 style)
        const routerABI = [
            {
                "inputs": [
                    {
                        "components": [
                            {"internalType": "address", "name": "tokenIn", "type": "address"},
                            {"internalType": "address", "name": "tokenOut", "type": "address"},
                            {"internalType": "uint24", "name": "fee", "type": "uint24"},
                            {"internalType": "address", "name": "recipient", "type": "address"},
                            {"internalType": "uint256", "name": "amountIn", "type": "uint256"},
                            {"internalType": "uint256", "name": "amountOutMinimum", "type": "uint256"},
                            {"internalType": "uint160", "name": "sqrtPriceLimitX96", "type": "uint160"}
                        ],
                        "internalType": "struct ISwapRouter.ExactInputSingleParams",
                        "name": "params",
                        "type": "tuple"
                    }
                ],
                "name": "exactInputSingle",
                "outputs": [{"internalType": "uint256", "name": "amountOut", "type": "uint256"}],
                "stateMutability": "payable", 
                "type": "function"
            },
            {
                "inputs": [
                    {"internalType": "bytes[]", "name": "data", "type": "bytes[]"}
                ],
                "name": "multicall",
                "outputs": [{"internalType": "bytes[]", "name": "results", "type": "bytes[]"}],
                "stateMutability": "payable",
                "type": "function"
            }
        ];
        
        // Buat contract
        const router = new ethers.Contract(ROUTER_ADDRESS, routerABI, wallet);
        const iface = new ethers.Interface(routerABI);
        
        // Generate alamat penerima random
        const recipientAddress = wallet.address; // Bisa diganti dengan generateRandomAddress() jika ingin ke random address
        
        // Buat data untuk exactInputSingle
        const exactInputSingleData = iface.encodeFunctionData(
            'exactInputSingle',
            [[
                WPHRS_ADDRESS,                    // tokenIn: WPHRS address
                USDC_ADDRESS,                     // tokenOut: USDC address
                500,                              // fee: 0.05%
                recipientAddress,                 // recipient: alamat penerima
                ethers.parseEther("0.001"),       // amountIn: 0.001 ETH
                0,                                // amountOutMinimum: tidak ada minimum output
                0                                 // sqrtPriceLimitX96: tidak ada batas harga
            ]]
        );
        
        // Kirim transaksi dengan multicall
        const tx = await router.multicall(
            [exactInputSingleData],
            {
                value: SWAP_AMOUNT, 
                gasLimit: GAS_LIMIT
            }
        );
        
        console.log(`Transaksi swap terkirim: ${tx.hash}`);
        
        // Menunggu konfirmasi
        const receipt = await tx.wait();
        console.log(`Transaksi swap berhasil dikonfirmasi pada block ${receipt.blockNumber}`);
        console.log(`Gas yang digunakan: ${receipt.gasUsed.toString()}`);
        
        return receipt;
    } catch (error) {
        console.error(`Error melakukan swap dari akun ${wallet.address}:`, error.message);
        throw error;
    }
}

// Fungsi untuk transfer PHRS ke random address
async function transferToRandomAddress(wallet) {
    try {
        // Generate random address
        const randomAddress = generateRandomAddress();
        
        console.log(`Transfer 0.001 PHRS dari ${wallet.address} ke random address ${randomAddress}...`);
        
        // Kirim transaksi native transfer
        const tx = await wallet.sendTransaction({
            to: randomAddress,
            value: TRANSFER_AMOUNT,
            gasLimit: 21000 // Gas limit standar untuk transfer
        });
        
        console.log(`Transaksi transfer terkirim: ${tx.hash}`);
        
        // Menunggu konfirmasi
        const receipt = await tx.wait();
        console.log(`Transfer ke ${randomAddress} berhasil!`);
        
        return receipt;
    } catch (error) {
        console.error(`Error melakukan transfer dari akun ${wallet.address}:`, error.message);
        throw error;
    }
}

// Fungsi utama untuk memproses akun
async function processAccount(privateKey) {
    try {
        // Koneksi ke provider
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        
        // Membuat wallet dari private key
        const wallet = new ethers.Wallet(privateKey, provider);
        
        console.log(`\n===== Memproses akun ${wallet.address} =====`);
        
        // Cek balance
        const balance = await provider.getBalance(wallet.address);
        console.log(`Balance: ${ethers.formatEther(balance)} PHRS`);
        
        if (balance < ethers.parseEther("0.002")) {
            console.log(`Balance tidak cukup untuk operasi swap dan transfer!`);
            return;
        }
        
        // 1. Lakukan swap
        await performSwap(wallet);
        
        // 2. Transfer ke random address
        await transferToRandomAddress(wallet);
        
        console.log(`Semua operasi untuk akun ${wallet.address} selesai!\n`);
    } catch (error) {
        console.error(`Gagal memproses akun: ${error.message}`);
    }
}

// Fungsi untuk menjalankan script secara otomatis setiap interval tertentu
async function startAutoProcess(totalIterations, intervalMinutes = 5) {
    console.log(`Auto process dimulai. Akan dijalankan setiap ${intervalMinutes} menit.`);
    console.log(`Jumlah akun yang akan diproses: ${PRIVATE_KEYS.length}`);
    console.log(`Jumlah iterasi yang akan dilakukan: ${totalIterations}`);
    
    let iterationCount = 0;
    let intervalId;
    
    // Fungsi untuk menjalankan proses sekali
    const runOnce = async () => {
        iterationCount++;
        console.log(`\n===== Memulai proses ITERASI ${iterationCount}/${totalIterations} pada ${new Date().toLocaleString()} =====`);
        
        // Proses semua akun secara berurutan
        for (const privateKey of PRIVATE_KEYS) {
            await processAccount(privateKey);
            
            // Tunggu 10 detik antara akun untuk menghindari throttling
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
        
        console.log(`===== Proses ITERASI ${iterationCount}/${totalIterations} selesai pada ${new Date().toLocaleString()} =====\n`);
        
        // Jika sudah mencapai iterasi maksimum, hentikan proses
        if (iterationCount >= totalIterations) {
            console.log(`\n===== SEMUA ITERASI SELESAI! Total: ${iterationCount} iterasi =====`);
            if (intervalId) {
                clearInterval(intervalId);
                console.log("Auto process telah berhenti.");
                process.exit(0); // Keluar dari proses ketika selesai
            }
        }
    };
    
    // Jalankan sekali di awal
    await runOnce();
    
    // Set interval untuk menjalankan secara berkala
    const intervalMs = intervalMinutes * 60 * 1000;
    intervalId = setInterval(async () => {
        // Hanya jalankan jika belum mencapai jumlah iterasi maksimum
        if (iterationCount < totalIterations) {
            await runOnce();
        }
    }, intervalMs);
}

// Jalankan program dengan input interaktif
async function main() {
    try {
        console.log("=== Auto Swap dan Transfer PHRS Script ===\n");
        
        // Tampilkan akun yang tersedia
        console.log(`Ditemukan ${PRIVATE_KEYS.length} akun:`);
        for (let i = 0; i < PRIVATE_KEYS.length; i++) {
            const wallet = new ethers.Wallet(PRIVATE_KEYS[i]);
            console.log(`${i+1}. ${wallet.address}`);
        }
        console.log("");
        
        // Tanya jumlah iterasi
        const iterationsInput = await askQuestion("Berapa kali Anda ingin menjalankan operasi swap dan transfer? [default: 5] ");
        const totalIterations = iterationsInput ? parseInt(iterationsInput) : 5;
        
        if (isNaN(totalIterations) || totalIterations <= 0) {
            console.log("Input tidak valid. Menggunakan nilai default: 5");
            await startAutoProcess(5);
        } else {
            // Tanya interval
            const intervalInput = await askQuestion("Berapa menit interval antar proses? [default: 5] ");
            const intervalMinutes = intervalInput ? parseInt(intervalInput) : 5;
            
            if (isNaN(intervalMinutes) || intervalMinutes <= 0) {
                console.log("Input interval tidak valid. Menggunakan nilai default: 5 menit");
                await startAutoProcess(totalIterations, 5);
            } else {
                await startAutoProcess(totalIterations, intervalMinutes);
            }
        }
    } catch (error) {
        console.error("Error dalam program:", error);
    }
}

// Jalankan program
main().catch(console.error);
