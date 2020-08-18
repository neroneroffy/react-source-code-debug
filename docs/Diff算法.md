# 概述

# 节点移动
    移动的目标是newChildren的节点。

    移动的参照物是newChildren里可以复用的节点中最靠右的那一个的位置索引（lastPlacedIndex）.这个索引是newChildren

    中能确定的最新的无需移动的节点的位置。也就是说newChildren中未遍历的节点都在它的右边。

    移动的逻辑是：newChildren中剩余的节点，都是不确定要不要移动的，遍历它们，每一个都去看看这个节点在旧fiber中的索引（上一次索引）。

    如果上一次的索引在lastPlacedIndex的右边，说明newChildren中的节点位置没变，并更新lastPlacedIndex为上一次索引。
    没变的原因是上次的索引在lastPlacedIndex的右边，本次这个节点在newChildren中的新索引依然在lastPlacedIndex的右边。

    如果上一次的索引在lastPlacedIndex的左边，当前这个节点的位置要往右挪。
    原因是上次的索引在lastPlacedIndex的左边，本次这个节点在newChildren中的新索引却跑到了在lastPlacedIndex的右边

    旧 A - B - C - D - E

    新 A - B - D - C - E

    可复用部分 A - B，newChildren里可以复用的节点中最靠右的位置为1（lastPlacedIndex），该节点为B
    旧fiber中的剩余部分C - D - E放入map
    newChildren的剩余部分D - C - E继续遍历

    首先遍历到D，从map中找到D在旧fiber中（A - B - C - D - E）的索引为3
    3 > 1，原来D的位置在B的位置的右边，本次的newChildren中也是如此，所以D的位置不动，更新lastPlacedIndex为3，此时可复用节点变成了D

    再遍历到C，从map中找到C在旧fiber中（A - B - C - D - E）的索引为2
    2 < 3，C 原来在最新固定位置的左边，本次的newChildren中C在D的右边，所以要给它移动到右边
