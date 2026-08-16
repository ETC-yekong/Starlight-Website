# 笔记本Archlinux Btrfs文件系统休眠配置（Zram+Swapfile方案）

## 前言

### 什么是休眠？
简单来说，休眠就是给电脑拍一张“快照”，把所有运行状态记在硬盘里，然后彻底断电。下次开机，直接把快照还原，一切恢复原样。

### 为什么要配置休眠？
* 告别电量焦虑：睡眠模式是“浅睡”，还在耗电；休眠是“深冻”，真·0耗电。出差路上再也不用担心电脑在包里发烫没电了。

* 保护你的小心脏（固态硬盘）：频繁的开关机对硬盘其实是一种“高压测试”。休眠恢复时只需读取一个大文件，远比开机时成千上万的小文件读写更健康。

* 打工人的“后悔药”：有时候急着走，没保存PPT就合盖了？休眠状态下，哪怕彻底没电，只要插上充电器，打开电脑，刚才的页面一字不差地还在那里。


### 休眠的适用场景
* 工作日的午休/下班：不用挑着文件保存，直接点休眠，下午一键进入心流状态。

* 频繁开会的场景：抱着电脑到处跑，休眠让你秒进会议室投屏，不用尴尬地等重启

* 可能会晚上断电的地方：如果笔记本24h开机碰上了夜晚断电（比如宿舍），休眠可以保存你电脑正在工作的内容并且保证电池不耗电，不用早晨起来再急头白脸的充电了

### 为什么是Zram+Swapfile？
Zram是Linux内核的一个功能模块，他是基于本机内存的一种压缩方式。相较于传统派Swap，Zram可以降低对硬盘的读写压力，能显著提高硬盘寿命和性能，并且他速度快，效率高，非常适合在笔记本这种环境中使用。  
### **但是！他不支持休眠！想要使用休眠，我们仍然需要用Swap**  
那如果我们既要Zram的高性能，又想要笔记本的休眠，就可以让二者并存，在使用电脑时用zram，swap只负责休眠工作。这样既能延长电脑硬盘寿命，也能确保我们的工作进度不会丢失。  
选择swapfile的原因是他灵活，后续如果想调整swap大小可以很方便的修改，免去了动分区扩容的风险。而且现在swapfile的性能与swap分区几乎相同，更适合作为我们的休眠方案。

---
##  准备工作
* Archlinux+Btrfs的电脑

## How to do?

### 一、创建swapfile（需要在archiso环境下进行）
进入archiso环境后，分别输入以下内容创建子卷
``` bash
#查看电脑硬盘分区，记住你的分区名字，比如我的分区名为nvme0n1p2
#每个人的分区名都不相同，以自己的为准
lsblk -pf
#第一次挂载，用来创建swap子卷
#之后swapfile将会放在这里，便于管理
mount -t btrfs /dev/（你的分区名称） /mnt
#创建swap子卷
btrfs subvolume create /mnt/@swap
#卸载
umount /mnt
#正式挂载子卷
mount -t btrfs -o subvol=/@,compress=zstd /dev/（你的btrfs系统分区名）/mnt
mount --mkdir -t btrfs -o subvol=/@swap,compress=zstd /dev/（你的btrfs系统分区名） /mnt/swap
```
然后创建并挂载swapfile
```bash
#创建swapfile
btrfs filesystem mkswapfile --size （根据自己电脑实际情况填写文件大小） --uuid clear /mnt/swap/swapfile
#挂载swapfile
swapon /mnt/swap/swapfile
```
swapfile 大小对照图表
|内存（GB）   |需要休眠（GB）| 不建议超过（GB）
|------|------|------|
|4|6|8
|5|7|10
|6|8|12
|8|11|16
|12|15|24
|16|20|32
|24|29|48
|32|38|64
|64|72|128
最后生成fstab文件
```bash
genfstab -U /mnt > /mnt/etc/fstab
```
此时你可以回到你自己的系统，用`fastfetch`查看一下swap是否启用。如果swap一栏显示了你的swap大小就证明已经启用

### 二、配置zram
进入系统后打开终端，安装zram-generator
```bash
sudo pacman -S zram-generator
```
然后编辑`/etc/systemd/zram-generator.conf`来配置zram
```bash
sudo vim /etc/systemd/zram-generator.conf
```
写入以下内容
```bash
[zram0]
zram-size = ram \ 2  #配置zram大小为内存的一半
compression-algorithm = zstd #配置zram压缩算法为zstd
swap-priority = 100 #最关键！让zram的优先级高于swapfile，这样才能确保电脑使用时会优先使用zram而不是swap
```
配置完zram后还需要编辑`/etc/default/grub`，在`GRUB_CMDLINE_LINUX_DEFAULT`一行的括号里写入`zswap.enabled=0`来禁用zswap，**最后保存**

更新一下grub
```bash
sudo grub-mkconfig -o /boot/grub/grub.cfg
```
重启系统后，在终端里输入以下内容来确定zram是否启用
```bash
swapon --show
```
如果输出中有`zram0`和`swap`，证明二者都已启用  
如果`prior`一行中zram0对应的数字大于swap对应的数字，则表示电脑在使用时会优先选择zram而不是swap

### 三、配置休眠
#### 1.查找下硬盘根分区的uuid和offset
打开终端，输入以下内容查找swapfile的offset
```bash
sudo btrfs inspect-internal map-swapfile /swap/swapfile
```
终端会输出一个`Physical start`和一个`Resume offset`，我们需要的是那个`Resume offset`，记住这串数字  
在终端输入以下内容来查找**根分区**uuid
```bash
findmnt -no UUID /
```
终端会直接输出你的uuid，记住这个东西
#### 2.编辑grub文件
编辑`/etc/default/grub`文件，在你写上`zswap.enabled=0`的位置后面空一格写入以下内容
```bash
resume=UUID=（你刚才查到的uuid） resume_offset=（你刚才查到的Resume offset值）
```
写完后**保存退出**，更新一下grub.cfg
```bash
sudo grub-mkconfig -o /boot/grub/grub.cfg
```
#### 3.配置resume钩子
编辑`/etc/mkinitcpio.conf`文件，在HOOKS一栏的括号里写入`resume`  
**注意：resume钩子的位置一定要在filesystems之后**
然后重新生成initcpio文件
```bash
sudo mkinitcpio -P 
```
然后重启

### 四、验证休眠是否启用
重启后随便打开点儿东西，然后在终端输入休眠指令
```bash
sudo systemctl hibernate
```
如果没有问题，电脑会直接关机，再开机后桌面上会显示你的终端和你打开的窗口，这就证明休眠配置成功了

>本来我想再写一个自动休眠的配置方法的，但我用的niri可能和桌面环境的配置不一样，没法保证都能用，所以关于自动休眠的方法先鸽了，等我之后搞明白会补上的 ~~（应该~~

## 常见问题
### 1.为什么配置完休眠试验的时候会提示一行红字？
可能是以下几种情况：
* 你的grub文件中的resume_offset可能写错了，建议检查一下  
* zram没有启用，可能是文件写错了，回去检查一下
* resume钩子没有添加
* 添加完钩子没生成initcpio
* ……你不会忘记更新grub.cfg了吧……

### 2.如果不配置resume钩子会怎么样？
你的电脑可能会一睡不起

### 3.其他文件系统可以这样配置吗？
有些步骤不行，但大致流程是差不多的，可以去网上找找其他教程帖子，或者直接问AI（建议问大肥鱼，不要问糖包）

### 4.Swap分区可以这样配置吗？
不行，建议找其他教程或问AI

## 参考资料
* Shorin-Kiwata：Archlinux-Guide（https://github.com/SHORiN-KiWATA/Shorin-ArchLinux-Guide）
* Arch-Wiki：Zram （https://wiki.archlinuxcn.org/wiki/Zram）
* Arch-Wiki：电源管理/挂起与休眠（https://wiki.archlinuxcn.org/wiki/%E7%94%B5%E6%BA%90%E7%AE%A1%E7%90%86/%E6%8C%82%E8%B5%B7%E4%B8%8E%E4%BC%91%E7%9C%A0）
* Arch-Wiki：Swap（https://wiki.archlinuxcn.org/wiki/Btrfs）
* Arch-Wiki：Btrfs（https://wiki.archlinuxcn.org/wiki/Swap）
* AI们
> ~~Arch Wiki真好用~~