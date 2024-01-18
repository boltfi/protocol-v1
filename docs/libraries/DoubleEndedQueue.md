# Solidity API

## DoubleEndedQueue

_Modified from OpenZeppelin Contracts (last updated v5.0.0) (utils/structs/DoubleEndedQueue.sol)
to support bytes (instead of bytes32). Removed unused functions as well_

### QueueEmpty

```solidity
error QueueEmpty()
```

_An operation (e.g. {front}) couldn't be completed due to the queue being empty._

### QueueFull

```solidity
error QueueFull()
```

_A push operation couldn't be completed due to the queue being full._

### QueueOutOfBounds

```solidity
error QueueOutOfBounds()
```

_An operation (e.g. {at}) couldn't be completed due to an index being out of bounds._

### BytesDeque

\_Indices are 128 bits so begin and end are packed in a single storage slot for efficient access.

Struct members have an underscore prefix indicating that they are "private" and should not be read or written to
directly. Use the functions provided below instead. Modifying the struct manually may violate assumptions and
lead to unexpected behavior.

The first item is at data[begin] and the last item is at data[end - 1]. This range can wrap around.\_

```solidity
struct BytesDeque {
  uint128 _begin;
  uint128 _end;
  mapping(uint128 => bytes) _data;
}
```

### pushBack

```solidity
function pushBack(struct DoubleEndedQueue.BytesDeque deque, bytes value) internal
```

\_Inserts an item at the end of the queue.

Reverts with {QueueFull} if the queue is full.\_

### popFront

```solidity
function popFront(struct DoubleEndedQueue.BytesDeque deque) internal returns (bytes value)
```

\_Removes the item at the beginning of the queue and returns it.

Reverts with `QueueEmpty` if the queue is empty.\_

### at

```solidity
function at(struct DoubleEndedQueue.BytesDeque deque, uint256 index) internal view returns (bytes value)
```

\_Return the item at a position in the queue given by `index`, with the first item at 0 and last item at
`length(deque) - 1`.

Reverts with `QueueOutOfBounds` if the index is out of bounds.\_

### length

```solidity
function length(struct DoubleEndedQueue.BytesDeque deque) internal view returns (uint256)
```

_Returns the number of items in the queue._

### empty

```solidity
function empty(struct DoubleEndedQueue.BytesDeque deque) internal view returns (bool)
```

_Returns true if the queue is empty._
