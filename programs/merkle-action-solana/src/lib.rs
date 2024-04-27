use anchor_lang::{
    prelude::*,
    solana_program::{self},
};

declare_id!("6xG5d22pnarYAgNySzEmEwkQ9jLGP8bexwFWDDMjvU25");

pub fn verify_proof(proof: Vec<[u8; 32]>, root: [u8; 32], leaf: [u8; 32]) -> bool {
    let mut computed_hash = leaf;
    for proof_element in proof.into_iter() {
        if computed_hash <= proof_element {
            // Hash(current computed hash + current element of the proof)
            computed_hash = solana_program::keccak::hashv(&[&computed_hash, &proof_element]).0;
        } else {
            // Hash(current element of the proof + current computed hash)
            computed_hash = solana_program::keccak::hashv(&[&proof_element, &computed_hash]).0;
        }
    }
    // Check if the computed hash (root) is equal to the provided root
    computed_hash == root
}

#[program]
pub mod merkle_action_solana {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, merkle_root: [u8; 32]) -> Result<()> {
        let base_state = &mut ctx.accounts.base_state;
        base_state.admin = *ctx.accounts.admin.key;
        base_state.root = merkle_root;
        base_state.counter = 0;
        base_state.leaf = merkle_root;
        Ok(())
    }

    pub fn update_merkle_root(ctx: Context<UpdateMerkleRoot>, merkle_root: [u8; 32]) -> Result<()> {
        let base_state = &mut ctx.accounts.base_state;
        require_keys_eq!(
            base_state.admin,
            *ctx.accounts.admin.key,
            WhitelistError::Unauthorized
        );
        base_state.root = merkle_root;
        Ok(())
    }

    pub fn target_function(ctx: Context<TargetFunction>, proof: Vec<[u8; 32]>) -> Result<()> {
        let base_state = &mut ctx.accounts.base_state;
        base_state.leaf =
            solana_program::keccak::hash(&ctx.accounts.user.key.to_string().as_bytes()).to_bytes();
        require!(
            verify_proof(
                proof,
                base_state.root,
                solana_program::keccak::hash(&ctx.accounts.user.key.to_string().as_bytes())
                    .to_bytes()
            ),
            WhitelistError::InvalidProof
        );

        base_state.counter += 1;
        Ok(())
    }
}

#[account]
pub struct BaseState {
    pub admin: Pubkey,
    pub root: [u8; 32],
    pub counter: u64,
    pub leaf: [u8; 32],
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, seeds = [b"base_state".as_ref()], bump, payer = admin, space = 8 + 32 + 32 + 8 + 32)]
    pub base_state: Account<'info, BaseState>,

    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateMerkleRoot<'info> {
    #[account(mut, seeds = [b"base_state".as_ref()], bump)]
    pub base_state: Account<'info, BaseState>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct TargetFunction<'info> {
    #[account(mut, seeds = [b"base_state".as_ref()], bump)]
    pub base_state: Account<'info, BaseState>,
    pub user: Signer<'info>,
}

#[error_code]
pub enum WhitelistError {
    #[msg("You are not authorized to perform this action.")]
    Unauthorized,

    #[msg("The provided proof is invalid.")]
    InvalidProof,
}
