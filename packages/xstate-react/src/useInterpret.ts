import { useState } from 'react';
import useIsomorphicLayoutEffect from 'use-isomorphic-layout-effect';
import {
  interpret,
  EventObject,
  StateMachine,
  State,
  Interpreter,
  InterpreterOptions,
  Typestate,
  Observer,
  TypegenConstraint,
  TypegenDisabled,
  AreAllImplementationsAssumedToBeProvided,
  MaybeTypegenMachineOptions,
  BaseActionObject
} from 'xstate';
import { MaybeLazy } from './types';
import useConstant from './useConstant';
import { UseMachineOptions } from './useMachine';
import { useReactEffectActions } from './useReactEffectActions';

// copied from core/src/utils.ts
// it avoids a breaking change between this package and XState which is its peer dep
function toObserver<T>(
  nextHandler: Observer<T> | ((value: T) => void),
  errorHandler?: (error: any) => void,
  completionHandler?: () => void
): Observer<T> {
  if (typeof nextHandler === 'object') {
    return nextHandler;
  }

  const noop = () => void 0;

  return {
    next: nextHandler,
    error: errorHandler || noop,
    complete: completionHandler || noop
  };
}

export function useInterpret<
  TContext,
  TEvent extends EventObject,
  TTypestate extends Typestate<TContext> = { value: any; context: TContext },
  TResolvedTypesMeta extends TypegenConstraint = TypegenDisabled
>(
  ...[
    getMachine,
    options = {},
    observerOrListener
  ]: AreAllImplementationsAssumedToBeProvided<TResolvedTypesMeta> extends false
    ? [
        getMachine: MaybeLazy<
          StateMachine<
            TContext,
            any,
            TEvent,
            TTypestate,
            any,
            TResolvedTypesMeta
          >
        >,
        options: Partial<InterpreterOptions> &
          Partial<UseMachineOptions<TContext, TEvent>> &
          MaybeTypegenMachineOptions<
            TContext,
            TEvent,
            BaseActionObject,
            TResolvedTypesMeta,
            true
          >,
        observerOrListener?:
          | Observer<
              State<TContext, TEvent, any, TTypestate, TResolvedTypesMeta>
            >
          | ((
              value: State<
                TContext,
                TEvent,
                any,
                TTypestate,
                TResolvedTypesMeta
              >
            ) => void)
      ]
    : [
        getMachine: MaybeLazy<
          StateMachine<
            TContext,
            any,
            TEvent,
            TTypestate,
            any,
            TResolvedTypesMeta
          >
        >,
        options?: Partial<InterpreterOptions> &
          Partial<UseMachineOptions<TContext, TEvent>> &
          MaybeTypegenMachineOptions<
            TContext,
            TEvent,
            BaseActionObject,
            TResolvedTypesMeta
          >,
        observerOrListener?:
          | Observer<
              State<TContext, TEvent, any, TTypestate, TResolvedTypesMeta>
            >
          | ((
              value: State<
                TContext,
                TEvent,
                any,
                TTypestate,
                TResolvedTypesMeta
              >
            ) => void)
      ]
): Interpreter<TContext, any, TEvent, TTypestate, TResolvedTypesMeta> {
  const machine = useConstant(() => {
    return typeof getMachine === 'function' ? getMachine() : getMachine;
  });

  if (
    process.env.NODE_ENV !== 'production' &&
    typeof getMachine !== 'function'
  ) {
    const [initialMachine] = useState(machine);

    if (machine !== initialMachine) {
      console.warn(
        'Machine given to `useMachine` has changed between renders. This is not supported and might lead to unexpected results.\n' +
          'Please make sure that you pass the same Machine as argument each time.'
      );
    }
  }

  const {
    context,
    guards,
    actions,
    activities,
    services,
    delays,
    state: rehydratedState,
    ...interpreterOptions
  } = options;

  const service = useConstant(() => {
    const machineConfig = {
      context,
      guards,
      actions,
      activities,
      services,
      delays
    };
    const machineWithConfig = machine.withConfig(machineConfig as any, () => ({
      ...machine.context,
      ...context
    }));

    return interpret(machineWithConfig as any, {
      deferEvents: true,
      ...interpreterOptions
    });
  });

  useIsomorphicLayoutEffect(() => {
    let sub;
    if (observerOrListener) {
      sub = service.subscribe(toObserver(observerOrListener) as any);
    }

    return () => {
      sub?.unsubscribe();
    };
  }, [observerOrListener]);

  useIsomorphicLayoutEffect(() => {
    service.start(
      rehydratedState ? (State.create(rehydratedState) as any) : undefined
    );

    return () => {
      service.stop();
    };
  }, []);

  // Make sure options are kept updated when they change.
  // This mutation assignment is safe because the service instance is only used
  // in one place -- this hook's caller.
  useIsomorphicLayoutEffect(() => {
    Object.assign(service.machine.options.actions, actions);
    Object.assign(service.machine.options.guards, guards);
    Object.assign(service.machine.options.activities, activities);
    Object.assign(service.machine.options.services, services);
    Object.assign(service.machine.options.delays, delays);
  }, [actions, guards, activities, services, delays]);

  useReactEffectActions(service);

  return service as any;
}
