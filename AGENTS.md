After each successful change, create a commit with a concise message describing the change.

Thorough code documentation with clear function comments and meaningful inline comments; consistent code spacing to separate logical blocks.

Comments should use full english sentences.

For example:

WRONG

```go
// generates a revocation key
func DeriveRevocationPubkey(commitPubKey *btcec.PublicKey,
	revokePreimage []byte) *btcec.PublicKey {
```

RIGHT

```go
// DeriveRevocationPubkey derives the revocation public key given the
// counterparty's commitment key, and revocation preimage derived via a
// pseudo-random-function. In the event that we (for some reason) broadcast a
// revoked commitment transaction, then if the other party knows the revocation
// preimage, then they'll be able to derive the corresponding private key to
// this private key by exploiting the homomorphism in the elliptic curve group:
//    * https://en.wikipedia.org/wiki/Group_homomorphism#Homomorphisms_of_abelian_groups
//
// The derivation is performed as follows:
//
//   revokeKey := commitKey + revokePoint
//             := G*k + G*h
//             := G * (k+h)
//
// Therefore, once we divulge the revocation preimage, the remote peer is able to
// compute the proper private key for the revokeKey by computing:
//   revokePriv := commitPriv + revokePreimge mod N
//
// Where N is the order of the sub-group.
func DeriveRevocationPubkey(commitPubKey *btcec.PublicKey,
	revokePreimage []byte) *btcec.PublicKey {
```

Comments in the body of the code are highly encouraged, but they should explain the intention of the code as opposed to just calling out the obvious.

WRONG

```go
// return err if amt is less than 546
if amt < 546 {
	return err
}
```

RIGHT

```go
// Treat transactions with amounts less than the amount which is considered dust
// as non-standard.
if amt < 546 {
	return err
}
```

NOTE: The above should really use a constant as opposed to a magic number, but it was left as a magic number to show how much of a difference a good comment can make.

Code should be organised into small functions that have a single responsibility. If a function is trying to do too much, it should be refactored into smaller functions.

Prefer `const foo = (a: A) => { ... }` over `function foo(a: A) { ... }` for defining functions.
