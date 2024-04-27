import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { MerkleActionSolana } from "../target/types/merkle_action_solana";
import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";
import { expect } from "chai";

function convertArrayToHexString(arr) {
  return arr.map((number) => number.toString(16).padStart(2, "0")).join("");
}

function hashToken(address: string) {
  // console.log("address", address);
  const hash = keccak256(Buffer.from(address));

  // console.log("hash: ", hash);

  return hash;
}

describe("merkle-action-solana", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace
    .MerkleActionSolana as Program<MerkleActionSolana>;
  const admin = Keypair.generate();

  const account1 = Keypair.generate();
  const account2 = Keypair.generate();
  const account3 = Keypair.generate();

  const noWhitelistAccount = Keypair.generate();

  const whitelist = [account1, account2, account3];

  let merkleTree: MerkleTree = new MerkleTree(
    whitelist.map((addr) => hashToken(addr.publicKey.toString())),
    keccak256,
    { sortPairs: true }
  );

  let merkleRoot = merkleTree.getHexRoot(); // Your merkle root here. Use a real one for an actual test.

  let [baseState] = PublicKey.findProgramAddressSync(
    [Buffer.from("base_state")],
    program.programId
  );

  before(async () => {
    const AIRDROP_AMOUNT = 10000000000;
    await anchor
      .getProvider()
      .connection.confirmTransaction(
        await anchor
          .getProvider()
          .connection.requestAirdrop(admin.publicKey, AIRDROP_AMOUNT),
        "confirmed"
      );

    console.log("airdropped");
  });

  it("Is initialized!", async () => {
    // Add your test here.

    const tx = await program.methods
      .initialize([...Buffer.from(merkleRoot.slice(2), "hex")])
      .accounts({
        baseState,
        admin: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([admin])
      .rpc();
    console.log("Your transaction signature", tx);
  });

  it("Should do action", async () => {
    // Assume `baseState` publicKey is available from the previous test

    const prevState = await program.account.baseState.fetch(baseState);

    // console.log(hashToken(account1.publicKey.toString()));

    const proof = merkleTree.getHexProof(
      hashToken(account1.publicKey.toString())
    );

    // console.log(proof);
    // console.log(merkleTree);

    const _proof = proof.map((p) => [...Buffer.from(p.slice(2), "hex")]);

    // console.log(_proof);
    // Transaction to update the merkle root
    await program.methods
      .targetFunction(_proof)
      .accounts({
        baseState,
        user: account1.publicKey,
      })
      .signers([account1])
      .rpc();

    const updatedState = await program.account.baseState.fetch(baseState);

    // console.log("leaf", updatedState.leaf);
    // console.log(Buffer.from(convertArrayToHexString(updatedState.leaf), "hex"));

    // console.log(
    //   merkleTree.verify(
    //     proof,
    //     Buffer.from(convertArrayToHexString(updatedState.leaf), "hex"),
    //     // hashToken(account1.publicKey.toString()),

    //     merkleRoot
    //   )
    // );

    // Assertions to verify the updated merkle root
    expect(updatedState.counter.toNumber() - 1).to.equal(
      prevState.counter.toNumber()
    );
  });

  it("Updates the merkle root", async () => {
    // Assume `baseState` publicKey is available from the previous test

    const newAccount = Keypair.generate();

    whitelist.push(newAccount);

    let newMerkleTree: MerkleTree = new MerkleTree(
      whitelist.map((addr) => hashToken(addr.publicKey.toString())),
      keccak256,
      { sortPairs: true }
    );

    let newMerkleRoot = newMerkleTree.getHexRoot(); // Your merkle root here. Use a real one for an actual test.

    // Transaction to update the merkle root
    await program.methods
      .updateMerkleRoot([...Buffer.from(newMerkleRoot.slice(2), "hex")])
      .accounts({
        baseState,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    const updatedAccount = await program.account.baseState.fetch(baseState);

    // Assertions to verify the updated merkle root
    expect("0x" + convertArrayToHexString(updatedAccount.root)).to.equal(
      newMerkleRoot
    );
  });
});
