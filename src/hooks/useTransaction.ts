import { useRef, useEffect, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, MONAD_TESTNET, EXPLORER_URL } from '../config/constants';
import { CONTRACT_ABI } from '../services/contractABI';
import toast from 'react-hot-toast';

export interface TransactionResult {
  hash: string;
  explorerUrl: string;
}

export const useTransaction = () => {
  const { user, authenticated, ready } = usePrivy();
  const { wallets } = useWallets();
  const [isLoading, setIsLoading] = useState(false);
  const userNonce = useRef(0);
  const providerRef = useRef<ethers.JsonRpcProvider | null>(null);
  const signerRef = useRef<ethers.Signer | null>(null);

  // Initialize provider and signer
  useEffect(() => {
    const initializeProvider = async () => {
      if (!ready || !authenticated || !user?.wallet?.address || !wallets.length) return;

      try {
        // Initialize provider
        const provider = new ethers.JsonRpcProvider(MONAD_TESTNET.rpcUrls.default.http[0]);
        providerRef.current = provider;

        // Get user's embedded wallet
        const userWallet = wallets.find(w => w.address === user.wallet?.address);
        if (!userWallet) return;

        // Get ethereum provider from Privy wallet
        const ethereumProvider = await userWallet.getEthereumProvider();
        const web3Provider = new ethers.BrowserProvider(ethereumProvider);
        const signer = await web3Provider.getSigner();
        signerRef.current = signer;

        // Get current nonce
        const nonce = await provider.getTransactionCount(user.wallet.address);
        userNonce.current = nonce;

        console.log('Transaction hook initialized successfully');
      } catch (error) {
        console.error('Failed to initialize transaction hook:', error);
        toast.error('Failed to initialize wallet connection');
      }
    };

    initializeProvider();
  }, [ready, authenticated, user, wallets]);

  // Send transaction with optimistic updates (Monad 2048 style)
  const sendTransaction = async (
    functionName: string,
    args: any[],
    optimisticUpdate?: () => void
  ): Promise<TransactionResult | null> => {
    if (!authenticated || !signerRef.current || !providerRef.current) {
      toast.error('Wallet not connected');
      return null;
    }

    setIsLoading(true);

    try {
      // Optimistic UI update (like Monad 2048)
      if (optimisticUpdate) {
        optimisticUpdate();
      }

      // Create contract instance
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signerRef.current);

      // Estimate gas
      const gasEstimate = await contract[functionName].estimateGas(...args);
      const gasLimit = gasEstimate * 120n / 100n; // Add 20% buffer

      // Get current gas price
      const feeData = await providerRef.current.getFeeData();
      
      // Send transaction
      const tx = await contract[functionName](...args, {
        gasLimit,
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      });

      const explorerUrl = `${EXPLORER_URL}/tx/${tx.hash}`;
      
      // Show immediate feedback (like Monad 2048)
      toast.success(
        <div>
          Transaction sent!
          <a 
            href={explorerUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-400 underline ml-2"
          >
            View on Explorer
          </a>
        </div>
      );

      // Wait for confirmation in background
      tx.wait().then(() => {
        toast.success('Transaction confirmed!');
      }).catch((error: any) => {
        console.error('Transaction failed:', error);
        toast.error('Transaction failed');
      });

      return {
        hash: tx.hash,
        explorerUrl
      };

    } catch (error: any) {
      console.error('Transaction error:', error);
      
      // Handle insufficient funds
      if (error.code === 'INSUFFICIENT_FUNDS') {
        toast.error('Insufficient funds. Please add MON to your wallet.');
      } else {
        toast.error('Transaction failed: ' + (error.message || 'Unknown error'));
      }
      
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Comment function (like Monad 2048's play function)
  const sendComment = async (username: string, message: string) => {
    return sendTransaction('comment', [username, message]);
  };

  // React function
  const sendReaction = async (emojiType: string) => {
    return sendTransaction('react', [emojiType]);
  };

  // Mint moment function
  const mintMoment = async (imageData: string) => {
    const timestamp = Math.floor(Date.now() / 1000);
    return sendTransaction('mintMoment', [imageData, timestamp]);
  };

  return {
    sendComment,
    sendReaction,
    mintMoment,
    isLoading,
    authenticated,
    ready,
    userAddress: user?.wallet?.address
  };
};