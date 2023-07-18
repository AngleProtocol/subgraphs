/* eslint-disable prefer-const */
import { Address, BigInt, BigDecimal, ethereum } from '@graphprotocol/graph-ts'
import { ONE, ONE_BD, ZERO, ZERO_BD } from '../../../constants'


export function exponentToBigDecimal(decimals: BigInt): BigDecimal {
    let bd = BigDecimal.fromString('1')
    for (let i = ZERO; i.lt(decimals as BigInt); i = i.plus(ONE)) {
        bd = bd.times(BigDecimal.fromString('10'))
    }
    return bd
}

// return 0 if denominator is 0 in division
export function safeDiv(amount0: BigDecimal, amount1: BigDecimal): BigDecimal {
    if (amount1.equals(ZERO_BD)) {
        return ZERO_BD
    } else {
        return amount0.div(amount1)
    }
}

export function bigDecimalExponated(value: BigDecimal, power: BigInt): BigDecimal {
    if (power.equals(ZERO)) {
        return ONE_BD
    }
    let negativePower = power.lt(ZERO)
    let result = ZERO_BD.plus(value)
    let powerAbs = power.abs()
    for (let i = ONE; i.lt(powerAbs); i = i.plus(ONE)) {
        result = result.times(value)
    }

    if (negativePower) {
        result = safeDiv(ONE_BD, result)
    }

    return result
}

export function tokenAmountToDecimal(tokenAmount: BigInt, exchangeDecimals: BigInt): BigDecimal {
    if (exchangeDecimals == ZERO) {
        return tokenAmount.toBigDecimal()
    }
    return tokenAmount.toBigDecimal().div(exponentToBigDecimal(exchangeDecimals))
}

export function priceToDecimal(amount: BigDecimal, exchangeDecimals: BigInt): BigDecimal {
    if (exchangeDecimals == ZERO) {
        return amount
    }
    return safeDiv(amount, exponentToBigDecimal(exchangeDecimals))
}

export function equalToZero(value: BigDecimal): boolean {
    const formattedVal = parseFloat(value.toString())
    const zero = parseFloat(ZERO_BD.toString())
    if (zero == formattedVal) {
        return true
    }
    return false
}

export function convertTokenToDecimal(tokenAmount: BigInt, exchangeDecimals: BigInt): BigDecimal {
    if (exchangeDecimals == ZERO) {
        return tokenAmount.toBigDecimal()
    }
    return tokenAmount.toBigDecimal().div(exponentToBigDecimal(exchangeDecimals))
}

export function convertTokenListToDecimal(tokenAmounts: BigInt[], exchangeDecimals: BigInt): BigDecimal[] {
    let returnList: BigDecimal[] = [];
    if (exchangeDecimals == ZERO) {
        for (let i = 0; i < tokenAmounts.length; i++) {
            returnList.push(tokenAmounts[i].toBigDecimal())
        }
    } else {
        for (let i = 0; i < tokenAmounts.length; i++) {
            returnList.push(tokenAmounts[i].toBigDecimal().div(exponentToBigDecimal(exchangeDecimals)))
        }
    }
    return returnList

}