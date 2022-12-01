import {
  CapitalGain,
  agToken,
  sanToken,
  externalToken,
  GaugeRewardData,
  GaugeRewardHistoricalData,
  Stake,
  Unstake,
  PoolData
} from '../../generated/schema'
import { Address, BigInt, ethereum } from '@graphprotocol/graph-ts'
import { SanToken } from '../../generated/templates/LiquidityGaugeTemplate/SanToken'
import { ERC20 } from '../../generated/templates/LiquidityGaugeTemplate/ERC20'
import { LiquidityGauge, Transfer, RewardDataUpdate } from '../../generated/templates/LiquidityGaugeTemplate/LiquidityGauge'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { SushiLPToken } from '../../generated/templates/LiquidityGaugeTemplate/SushiLPToken'
import { PerpetualManagerFront } from '../../generated/templates/StableMasterTemplate/PerpetualManagerFront'
import { StableMaster } from '../../generated/templates/LiquidityGaugeTemplate/StableMaster'
import { getToken, historicalSlice } from './utils'
import { BASE_TOKENS, DECIMAL_TOKENS, ZERO_BD } from '../../../constants'
import { convertTokenToDecimal } from '../utils'

function isBurn(event: Transfer): boolean {
  return event.params._to.equals(Address.fromString('0x0000000000000000000000000000000000000000'))
}

function isMint(event: Transfer): boolean {
  return event.params._from.equals(Address.fromString('0x0000000000000000000000000000000000000000'))
}

export function handleTransfer(event: Transfer): void {

  if (event.params._value.equals(BigInt.fromString('0'))) return

  updateGaugeSupplyData(event)

  const stakingRewardsContract = LiquidityGauge.bind(event.address)

  const token = ERC20.bind(stakingRewardsContract.staking_token())
  const tokenInfo = getToken(token._address)

  const decimals = token.decimals().toString()
  const name = token.name()
  const txId =
    event.transaction.hash.toHexString() +
    '_' +
    event.params._to.toHexString() +
    '_' +
    event.params._from.toHexString() +
    '_' +
    event.params._value.toString()

  const amount = convertTokenToDecimal(event.params._value, tokenInfo.decimals)
  if (!isBurn(event)) {
    let txData = new Stake(txId)
    txData.transactionId = event.transaction.hash.toHexString()
    txData.amount = amount
    txData.sender = event.params._from.toHexString()
    txData.stakedToken = name
    txData.timestamp = event.block.timestamp
    txData.blockNumber = event.block.number
    txData.save()
    handleStaked(token._address, event)
  }
  if (!isMint(event)) {
    let txData = new Unstake(txId)
    txData.transactionId = event.transaction.hash.toHexString()
    txData.amount = amount
    txData.decimals = decimals
    txData.sender = event.params._from.toHexString()
    txData.stakedToken = name
    txData.timestamp = event.block.timestamp
    txData.blockNumber = event.block.number
    txData.save()
    handleUnstaked(token._address, event)
  }
}

export function updateGaugeData(event: RewardDataUpdate): void {
  const stakingRewardsContract = LiquidityGauge.bind(event.address)
  const block = event.block
  const timestamp = block.timestamp
  const rewardInfo = getToken(event.params._token)
  const gaugeId = event.address.toHexString()
  const id = gaugeId + '_' + rewardInfo.id
  // we round to the closest hour
  const roundedTimestamp = historicalSlice(block)
  const idHistoricalHour = id + '_hour_' + roundedTimestamp.toString()

  let data = GaugeRewardData.load(id)
  if (data == null) {
    data = new GaugeRewardData(id)
    const decimalsStakedToken = stakingRewardsContract.decimals()
    data.decimalsStakedToken = decimalsStakedToken
    data.gauge = gaugeId
    data.token = rewardInfo.id
    data.decimals = rewardInfo.decimals
    data.tokenSymbol = rewardInfo.symbol
  }

  const rewardData = stakingRewardsContract.reward_data(event.params._token)
  const distributor = rewardData.value1.toHexString()
  const periodFinish = rewardData.value2
  const rewardRate = convertTokenToDecimal(rewardData.value3, rewardInfo.decimals)
  const lastUpdateTime = rewardData.value4
  const totalSupply = convertTokenToDecimal(stakingRewardsContract.totalSupply(), data.decimalsStakedToken)
  const workingSupply = convertTokenToDecimal(stakingRewardsContract.working_supply(), data.decimalsStakedToken)

  data.distributor = distributor
  data.periodFinish = periodFinish
  data.rewardRate = rewardRate
  data.lastUpdateTime = lastUpdateTime
  data.totalSupply = totalSupply
  data.workingSupply = workingSupply
  data.blockNumber = block.number
  data.timestamp = timestamp

  let dataHistorical = GaugeRewardHistoricalData.load(idHistoricalHour)
  if (dataHistorical == null) {
    dataHistorical = new GaugeRewardHistoricalData(idHistoricalHour)
    dataHistorical.gauge = gaugeId
    dataHistorical.token = rewardInfo.id
    dataHistorical.decimals = rewardInfo.decimals
    dataHistorical.decimalsStakedToken = data.decimalsStakedToken
    dataHistorical.tokenSymbol = rewardInfo.symbol
    dataHistorical.distributor = distributor
    dataHistorical.periodFinish = periodFinish
    dataHistorical.rewardRate = rewardRate
    dataHistorical.lastUpdateTime = lastUpdateTime
    dataHistorical.totalSupply = totalSupply
    dataHistorical.workingSupply = workingSupply
    dataHistorical.blockNumber = block.number
    dataHistorical.timestamp = roundedTimestamp
  } else {
    dataHistorical.distributor = distributor
    dataHistorical.periodFinish = periodFinish
    dataHistorical.rewardRate = rewardRate
    dataHistorical.lastUpdateTime = lastUpdateTime
    dataHistorical.totalSupply = totalSupply
    dataHistorical.workingSupply = workingSupply
    dataHistorical.blockNumber = block.number
    dataHistorical.timestamp = roundedTimestamp
    // token can change (cf uni migration)
    dataHistorical.token = rewardInfo.id
    dataHistorical.decimals = rewardInfo.decimals
    dataHistorical.decimalsStakedToken = data.decimalsStakedToken
    dataHistorical.tokenSymbol = rewardInfo.symbol
  }

  data.save()
  dataHistorical.save()
}

export function updateGaugeSupplyData(event: ethereum.Event): void {
  const stakingRewardsContract = LiquidityGauge.bind(event.address)
  const block = event.block
  const timestamp = block.timestamp

  // common values
  const gaugeId = event.address.toHexString()
  const totalSupply = stakingRewardsContract.totalSupply()
  const workingSupply = stakingRewardsContract.working_supply()

  const rewardCount = parseInt(stakingRewardsContract.reward_count().toString())
  for (let i = 0; i < rewardCount; i++) {
    const token = stakingRewardsContract.reward_tokens(BigInt.fromString(i.toString()))
    const rewardInfo = getToken(token)
    const id = gaugeId + '_' + token.toHexString()
    // we round to the closest hour
    const roundedTimestamp = historicalSlice(block)
    const idHistoricalHour = id + '_hour_' + roundedTimestamp.toString()

    let data = GaugeRewardData.load(id)
    if (data == null) {
      data = new GaugeRewardData(id)
      const decimalsStakedToken = stakingRewardsContract.decimals()
      data.decimalsStakedToken = decimalsStakedToken
      data.gauge = gaugeId
      data.token = rewardInfo.id
      data.decimals = rewardInfo.decimals
      data.tokenSymbol = rewardInfo.symbol
    }

    data.gauge = gaugeId
    data.totalSupply = convertTokenToDecimal(totalSupply, data.decimalsStakedToken)
    data.workingSupply = convertTokenToDecimal(workingSupply, data.decimalsStakedToken)
    data.blockNumber = block.number
    data.timestamp = timestamp

    let dataHistorical = GaugeRewardHistoricalData.load(idHistoricalHour)
    if (dataHistorical == null) {
      dataHistorical = new GaugeRewardHistoricalData(idHistoricalHour)
      dataHistorical.gauge = gaugeId
      dataHistorical.decimalsStakedToken = data.decimalsStakedToken
      dataHistorical.totalSupply = data.totalSupply
      dataHistorical.workingSupply = data.workingSupply
      dataHistorical.blockNumber = block.number
      dataHistorical.timestamp = roundedTimestamp
    } else {
      dataHistorical.totalSupply = data.totalSupply
      dataHistorical.workingSupply = data.workingSupply
      dataHistorical.blockNumber = block.number
      dataHistorical.timestamp = roundedTimestamp
      // token can change (cf uni migration)
      dataHistorical.decimalsStakedToken = data.decimalsStakedToken
      dataHistorical.token = token.toHexString()
    }

    data.save()
    dataHistorical.save()
  }
}

export function handleUpdatePerpStaking(event: ethereum.Event): void {
  const stakingRewardsContract = PerpetualManagerFront.bind(event.address)
  const block = event.block
  const timestamp = block.timestamp

  const id = event.address.toHexString()
  // we round to the closest hour
  const roundedTimestamp = historicalSlice(block)
  const idHistoricalHour = id + '_hour_' + roundedTimestamp.toString()

  const perpetualManager = PerpetualManagerFront.bind(Address.fromString(event.address.toHexString()))
  let inputPool = perpetualManager.poolManager().toHexString()
  const poolData = PoolData.load(inputPool)!
  const decimalsStakedToken = poolData.decimals

  const periodFinish = stakingRewardsContract.periodFinish()
  const rewardRate = stakingRewardsContract.rewardRate()
  const lastUpdateTime = stakingRewardsContract.lastUpdateTime()
  const totalSupply = stakingRewardsContract.totalHedgeAmount()
  const rewardsDistributor = stakingRewardsContract.rewardsDistribution().toHexString()

  let data = GaugeRewardData.load(id)
  if (data == null) {
    const token = stakingRewardsContract.rewardToken()
    const rewardInfo = getToken(token)
    data = new GaugeRewardData(id)
    data.decimals = rewardInfo.decimals
    data.decimalsStakedToken = decimalsStakedToken
    data.tokenSymbol = rewardInfo.symbol
    data.gauge = id
    data.token = token.toHexString()
  }

  data.periodFinish = periodFinish
  data.distributor = rewardsDistributor
  data.rewardRate = convertTokenToDecimal(rewardRate, data.decimals)
  data.lastUpdateTime = lastUpdateTime
  data.totalSupply = convertTokenToDecimal(totalSupply, data.decimalsStakedToken)
  data.blockNumber = block.number
  data.timestamp = timestamp

  let dataHistorical = GaugeRewardHistoricalData.load(idHistoricalHour)
  if (dataHistorical == null) {
    dataHistorical = new GaugeRewardHistoricalData(idHistoricalHour)
    dataHistorical.gauge = id
    dataHistorical.decimalsStakedToken = decimalsStakedToken
    dataHistorical.token = data.token
    dataHistorical.periodFinish = periodFinish
    dataHistorical.distributor = rewardsDistributor
    dataHistorical.rewardRate = data.rewardRate
    dataHistorical.lastUpdateTime = lastUpdateTime
    dataHistorical.totalSupply = data.totalSupply
    dataHistorical.blockNumber = block.number
    dataHistorical.timestamp = roundedTimestamp
  } else {
    dataHistorical.periodFinish = periodFinish
    dataHistorical.rewardRate = data.rewardRate
    dataHistorical.lastUpdateTime = lastUpdateTime
    dataHistorical.totalSupply = data.totalSupply
    dataHistorical.distributor = rewardsDistributor
    dataHistorical.blockNumber = block.number
    dataHistorical.timestamp = roundedTimestamp
  }

  data.save()
  dataHistorical.save()
}

// @notice Handles tracking tokens balances in case of staking
// @dev We first need to figure what type of tokens it is: agTokens, sanTokens, others.
// @dev Then special cases arise, there has been 2 migration from GUni pools to another ones
// @dev We need to look at both contract addresses, which explains the hardcoded addresses
export function handleStaked(token: Address, event: Transfer): void {
  const tokenDataId = event.params._to.toHexString() + '_' + token.toHexString()

  const sanTokenContract = SanToken.bind(token)
  const result = sanTokenContract.try_poolManager()

  let tokenInfo = getToken(token);
  let valueDecimal = convertTokenToDecimal(event.params._value, tokenInfo.decimals)

  // In this case the staked token is a AgToken
  if (result.reverted) {
    if (tokenInfo.name.substr(0, 2) == 'ag') {
      let data = agToken.load(tokenDataId)
      if (data == null) {
        data = new agToken(tokenDataId)
        data.stableName = tokenInfo.name
        data.balance = ZERO_BD
        data.owner = event.params._to.toHexString()
        data.token = token.toHexString()
        data.staked = valueDecimal
      } else {
        data.staked = data.staked.plus(valueDecimal)
      }
      data.save()
    } else {
      let modifyTokenDataID = tokenDataId
      let scalingFactor = BASE_TOKENS

      // we keep the address of the new tokens and not the old ones
      const liquidityGaugeContract = LiquidityGauge.bind(event.address)
      const resultScalingFactor = liquidityGaugeContract.try_scaling_factor()
      if (resultScalingFactor.reverted) {
        const tokenHex = token.toHexString()
        if (tokenHex == '0x2bd9f7974bc0e4cb19b8813f8be6034f3e772add') {
          // uni migration agEUR/USDC
          const tmpToken = Address.fromString('0xedecb43233549c51cc3268b5de840239787ad56c')
          modifyTokenDataID = event.params._to.toHexString() + '_' + tmpToken.toHexString()
        } else if (tokenHex == '0x26c2251801d2cfb5461751c984dc3eaa358bdf0f') {
          // uni migration agEUR/ETH
          const tmpToken = Address.fromString('0x857e0b2ed0e82d5cdeb015e77ebb873c47f99575')
          modifyTokenDataID = event.params._to.toHexString() + '_' + tmpToken.toHexString()
        }
      } else {
        scalingFactor = resultScalingFactor.value
      }
      let scalingFactorDecimal = convertTokenToDecimal(scalingFactor, DECIMAL_TOKENS)

      let data = externalToken.load(modifyTokenDataID)
      if (data == null) {
        data = new externalToken(modifyTokenDataID)
        let name = tokenInfo.name
        if (tokenInfo.name.split(' ')[0] == 'SushiSwap' || name.split(' ')[0] == 'Uniswap V2') {
          name = `${name} ${ERC20.bind(SushiLPToken.bind(token).token0()).symbol()}/${ERC20.bind(
            SushiLPToken.bind(token).token1()
          ).symbol()}`
        }
        data.name = name
        data.balance = convertTokenToDecimal(ERC20.bind(token).balanceOf(event.params._to), tokenInfo.decimals)
        data.owner = event.params._to.toHexString()
        data.token = token.toHexString()
        data.staked = valueDecimal.div(scalingFactorDecimal)
      } else {
        data.staked = data.staked.plus(valueDecimal.div(scalingFactorDecimal))
      }
      data.save()
    }

    // In this case the staked token is a SanToken
  } else {
    const poolManager = PoolManager.bind(result.value)
    const stableMaster = StableMaster.bind(poolManager.stableMaster())
    const collatToken = ERC20.bind(poolManager.token())

    // Read names and sanRate
    const stableName = ERC20.bind(stableMaster.agToken()).symbol()
    const collatName = collatToken.symbol()
    const sanRate = stableMaster.collateralMap(poolManager._address).value5

    let data = sanToken.load(tokenDataId)

    const addressId = event.params._to.toHexString() + '_' + collatName + '_' + stableName.substr(2)
    // Balance of staked tokens before the call
    const balance = data == null ? ZERO_BD : data.staked
    let sanRateDecimal = convertTokenToDecimal(sanRate, DECIMAL_TOKENS)
    const lastStakedPosition = balance
      .plus(valueDecimal)
      .times(sanRateDecimal)

    let gainData = CapitalGain.load(addressId)
    if (gainData == null) {
      gainData = new CapitalGain(addressId)
      gainData.gains = ZERO_BD
      gainData.lastPosition = ZERO_BD
    }
    gainData.gains = gainData.gains.plus(balance.times(sanRateDecimal)).minus(gainData.lastStakedPosition)
    gainData.lastStakedPosition = lastStakedPosition

    gainData.save()

    if (data == null) {
      gainData = new CapitalGain(addressId)
      gainData.gains = ZERO_BD
      gainData.lastPosition = ZERO_BD

      data = new sanToken(tokenDataId)
      data.owner = event.params._to.toHexString()
      data.token = token.toHexString()
      data.balance = ZERO_BD
      data.collatName = collatName
      data.stableName = stableName
      data.staked = valueDecimal
    } else {
      data.staked = data.staked.plus(valueDecimal)
    }
    data.save()
  }
}

export function handleUnstaked(token: Address, event: Transfer): void {
  const tokenDataId = event.params._from.toHexString() + '_' + token.toHexString()

  const sanTokenContract = SanToken.bind(token)
  const result = sanTokenContract.try_poolManager()

  let tokenInfo = getToken(token);
  let valueDecimal = convertTokenToDecimal(event.params._value, tokenInfo.decimals)

  // In this case the staked token is a AgToken
  if (result.reverted) {
    if (tokenInfo.symbol.substr(0, 2) == 'ag') {
      const data = agToken.load(tokenDataId)!
      data.staked = data.staked.minus(valueDecimal)
      data.save()
    } else {
      let modifyTokenDataID = tokenDataId
      // we keep the address of the new tokens and not the old ones
      const liquidityGaugeContract = LiquidityGauge.bind(event.address)
      const resultScalingFactor = liquidityGaugeContract.try_scaling_factor()
      if (resultScalingFactor.reverted) {
        const tokenHex = token.toHexString()
        if (tokenHex == '0x2bd9f7974bc0e4cb19b8813f8be6034f3e772add') {
          // uni migration agEUR/USDC
          const tmpToken = Address.fromString('0xedecb43233549c51cc3268b5de840239787ad56c')
          modifyTokenDataID = event.params._from.toHexString() + '_' + tmpToken.toHexString()
        } else if (tokenHex == '0x26c2251801d2cfb5461751c984dc3eaa358bdf0f') {
          // uni migration agEUR/ETH
          const tmpToken = Address.fromString('0x857e0b2ed0e82d5cdeb015e77ebb873c47f99575')
          modifyTokenDataID = event.params._from.toHexString() + '_' + tmpToken.toHexString()
        }
      }

      // this may be non null
      const data = externalToken.load(modifyTokenDataID)!
      // For external tokens we don't want to track there actual balance but just what is going through on the protocol
      // Otherwise this would asks to track all the other tokens when entering/exiting/transferring
      data.balance = data.balance.plus(valueDecimal)
      data.staked = data.staked.minus(valueDecimal)
      data.save()
    }
  } else {
    // In this case the staked token is a SanToken
    const poolManager = PoolManager.bind(result.value)
    const stableMaster = StableMaster.bind(poolManager.stableMaster())
    const collatToken = ERC20.bind(poolManager.token())

    // Read names and sanRate
    const stableName = ERC20.bind(stableMaster.agToken()).symbol()
    const collatName = collatToken.symbol()
    const sanRate = stableMaster.collateralMap(poolManager._address).value5

    const data = sanToken.load(tokenDataId)!

    const addressId = event.params._from.toHexString() + '_' + collatName + '_' + stableName.substr(2)
    // Balance of staked tokens before the call
    const balance = data.staked
    let sanRateDecimal = convertTokenToDecimal(sanRate, DECIMAL_TOKENS)
    const lastStakedPosition = balance
      .minus(valueDecimal)
      .times(sanRateDecimal)

    const gainData = CapitalGain.load(addressId)!
    gainData.gains = gainData.gains.plus(balance.times(sanRateDecimal)).minus(gainData.lastStakedPosition)
    gainData.lastStakedPosition = lastStakedPosition
    gainData.save()

    data.staked = data.staked.minus(valueDecimal)
    data.save()
  }
}
